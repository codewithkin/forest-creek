import { randomUUID } from "node:crypto";

import { buildGuestContext } from "./booking-tools";
import type { ConciergeMessage } from "./history";
import { PHOTO_OUTBOX_KEY, RECENT_PHOTOS_KEY, sendPhotosTool, type PhotoToSend, type RecentPhoto } from "./photos";
import { conciergeModel } from "./config";
import { finalReplyText } from "./reply-text";
import { routingFor, type Routing } from "./routing";
import { calledAnyTool, correctionInstructions, groundFirstStep, mergeRetry, retryTools } from "./steps";
import { buildBookingInstructions, getBookingAgent, whatsappAgentTools, type BookingChannel } from "./whatsapp-agent";

/**
 * Everything worth knowing about one agent turn. Both production call sites go
 * through these runners, so the evals measure exactly what guests get — and
 * which model actually answered is observable rather than assumed.
 */
export type AgentRun = {
  /** Only the grounded final answer; see finalReplyText for why. */
  text: string;
  /** The model the provider reports serving the reply, e.g. "deepseek/deepseek-v3.2". */
  modelId: string | undefined;
  /** The upstream inference provider OpenRouter routed to, e.g. "StreamLake". */
  provider: string | undefined;
  toolsCalled: string[];
  /** Raw tool results, for grounding. */
  toolResults: unknown;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | undefined };
  latencyMs: number;
  /** Photos send-photos queued this turn, to go out after (WhatsApp) or under (website) the reply. */
  photos: PhotoToSend[];
};

/**
 * A turn may open with any tool but send-photos. NOT send-photos: photos land
 * on the guest's phone. Offered as a forced first call, it was the model's
 * pick whenever a message needed no lookup ("Hi", "Perfect", a note meant for
 * staff), so guests got the same photos again. Limited to
 * read-only tools, a guest who answered "which number?" could not be charged
 * straight away: the forced first call was a lookup, which found their own
 * booking, and the agent asked them to confirm the number again — a whole
 * extra turn. create-booking is safe here because its first call only reads
 * the stay back (ConfirmationGate); request-payment needs the number the
 * guest gave.
 */
export const WHATSAPP_FIRST_STEP_TOOLS = Object.keys(whatsappAgentTools).filter((id) => id !== sendPhotosTool.id);

/**
 * A stalled upstream otherwise holds the request until Bun's 300-second fetch
 * default, leaving a guest waiting five minutes for the failure reply. Both
 * call sites already turn a thrown error into a safe reply.
 */
const AGENT_TIMEOUT_MS = 90_000;

/**
 * Mastra stops after 5 steps by default. A WhatsApp confirmation turn can use
 * all five on tools (lookups, availability, create-booking, request-payment),
 * leaving no step to speak: a guest was booked and then told something went wrong.
 */
const AGENT_MAX_STEPS = 12;

/**
 * Every turn should start from real data, but most upstreams ignore
 * tool_choice "required" (see calledAnyTool). A run that called no tool
 * answered from memory, so it gets exactly one more attempt, on the provider
 * most likely to call one.
 */
async function generateFromData(
  generate: (providerOptions: Routing | undefined) => Promise<unknown>,
): Promise<unknown> {
  const first = await generate(routingFor(conciergeModel, "first"));
  if (calledAnyTool(first)) return first;
  console.warn("[ai] a turn called no tool; retrying it once");
  return generate(routingFor(conciergeModel, "retry"));
}

type OpenRouterMetadata = {
  openrouter?: { provider?: string; usage?: { cost?: number } };
};

type RawRun = {
  response?: { modelId?: string };
  providerMetadata?: OpenRouterMetadata;
  steps?: Array<{ providerMetadata?: OpenRouterMetadata }>;
  toolCalls?: Array<{ toolName?: string; payload?: { toolName?: string } }>;
  toolResults?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
  totalUsage?: { inputTokens?: number; outputTokens?: number };
};

function summarise(raw: unknown, startedAt: number): AgentRun {
  const result = raw as RawRun;
  const usage = result.totalUsage ?? result.usage;

  // A tool-using turn is several model calls; OpenRouter prices each step.
  const stepCosts = (result.steps ?? [])
    .map((step) => step.providerMetadata?.openrouter?.usage?.cost)
    .filter((cost): cost is number => typeof cost === "number");

  return {
    text: finalReplyText(raw),
    modelId: result.response?.modelId,
    provider: result.providerMetadata?.openrouter?.provider,
    toolsCalled: (result.toolCalls ?? [])
      .map((call) => call.payload?.toolName ?? call.toolName)
      .filter((name): name is string => Boolean(name)),
    toolResults: result.toolResults,
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd:
        stepCosts.length > 0
          ? stepCosts.reduce((sum, cost) => sum + cost, 0)
          : result.providerMetadata?.openrouter?.usage?.cost,
    },
    latencyMs: Date.now() - startedAt,
    photos: [],
  };
}

/**
 * The website chat widget's assistant: the same booking agent as WhatsApp —
 * book, pay, photos, quotes — with the website's own instructions. A visitor
 * is anonymous, so they are known by the chat session they book in.
 */
export async function runConcierge(
  messages: ConciergeMessage[],
  options: {
    today: string;
    chatSessionId?: string;
    recentPhotos?: RecentPhoto[];
    check?: (run: AgentRun) => Promise<string | undefined>;
  },
): Promise<AgentRun> {
  return runBookingAgent(messages, {
    today: options.today,
    channel: "web",
    check: options.check,
    // Without a session nothing is ever this visitor's; a fresh one keeps that true.
    chatSessionId: options.chatSessionId ?? `web-unknown:${randomUUID()}`,
    recentPhotos: options.recentPhotos,
  });
}

/** The booking agent, for WhatsApp (known by phone) or the website (known by chat). */
export async function runBookingAgent(
  messages: ConciergeMessage[],
  options: {
    today: string;
    channel: BookingChannel;
    /** WhatsApp: the number the guest messages from. */
    guestPhone?: string;
    /** The chat this turn belongs to — how a website guest is recognised. */
    chatSessionId?: string;
    /** Photos this guest was sent lately, so send-photos does not repeat them unasked. */
    recentPhotos?: RecentPhoto[];
    /**
     * The caller's reply check (groundReply): the reason a reply may not be
     * sent, or undefined. A blocked reply gets ONE corrected attempt.
     */
    check?: (run: AgentRun) => Promise<string | undefined>;
  },
): Promise<AgentRun> {
  const startedAt = Date.now();
  // One context for both attempts: they answer the same guest message, so the same turn.
  const requestContext = buildGuestContext({
    phone: options.guestPhone || undefined,
    chatSessionId: options.chatSessionId,
    channel: options.channel,
  });
  const photos: PhotoToSend[] = [];
  requestContext.set(PHOTO_OUTBOX_KEY, photos);
  requestContext.set(RECENT_PHOTOS_KEY, options.recentPhotos ?? []);
  const instructions = buildBookingInstructions(options.channel, options.today);
  const result = await generateFromData((providerOptions) =>
    getBookingAgent().generate(messages, {
      instructions,
      providerOptions,
      requestContext,
      prepareStep: (step) => groundFirstStep(step, WHATSAPP_FIRST_STEP_TOOLS),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      maxSteps: AGENT_MAX_STEPS,
    }),
  );
  const first: AgentRun = { ...summarise(result, startedAt), photos: [...photos] };
  const reason = options.check ? await options.check(first) : undefined;
  if (!reason) return first;

  // Blocked: the guest would get a dead end ("the team will pick this up")
  // and the model would never learn why. It gets one more attempt, told the
  // reason and what its tools already did. The SAME requestContext, so the
  // same turn: the retry can never count as the guest confirming a booking.
  // The retry goes through the caller's check again — a second invention is
  // still never sent.
  console.warn(`[ai] reply blocked (${reason}); one corrected attempt`);
  photos.length = 0;
  const tools = retryTools(Object.keys(whatsappAgentTools), first.toolsCalled);
  const retried = summarise(
    await getBookingAgent().generate(messages, {
      instructions: instructions + correctionInstructions(reason, first.toolResults),
      providerOptions: routingFor(conciergeModel, "first"),
      requestContext,
      prepareStep: () => ({ activeTools: tools }),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      maxSteps: AGENT_MAX_STEPS,
    }),
    startedAt,
  );
  return mergeRetry(first, retried, photos);
}
