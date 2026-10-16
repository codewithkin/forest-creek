import { getConcierge, buildInstructions } from "./agent";
import { buildGuestContext } from "./booking-tools";
import type { ConciergeMessage } from "./history";
import { listMyBookingsTool, paymentReadTools } from "./payment-tools";
import { PHOTO_OUTBOX_KEY, RECENT_PHOTOS_KEY, sendPhotosTool, type PhotoToSend, type RecentPhoto } from "./photos";
import { conciergeModel } from "./config";
import { finalReplyText } from "./reply-text";
import { routingFor, type Routing } from "./routing";
import { calledAnyTool, groundFirstStep } from "./steps";
import { conciergeTools } from "./tools";
import { buildWhatsappInstructions, getBookingAgent, whatsappAgentTools } from "./whatsapp-agent";

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
  /** Photos send-photos queued this turn (WhatsApp only), to go out after the reply. */
  photos: PhotoToSend[];
};

/** Tools a forced first call may use: everything that only reads. */
// So are the payment look-ups and quotes, and listing the guest's own bookings.
// NOT send-photos: photos land on the guest's phone. Offered as a forced first
// call, it was the model's pick whenever a message needed no lookup ("Hi",
// "Perfect", a note meant for staff), so guests got the same photos again.
const READ_ONLY_TOOLS = [...Object.keys(conciergeTools), ...Object.keys(paymentReadTools), listMyBookingsTool.id];

/**
 * The WhatsApp agent may open a turn with any tool but send-photos. Limited to
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

/** The website concierge: read-only tools, used by the chat widget. */
export async function runConcierge(
  messages: ConciergeMessage[],
  options: { today: string },
): Promise<AgentRun> {
  const startedAt = Date.now();
  const result = await generateFromData((providerOptions) =>
    getConcierge().generate(messages, {
      instructions: buildInstructions(options.today),
      providerOptions,
      prepareStep: (step) => groundFirstStep(step, READ_ONLY_TOOLS),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      maxSteps: AGENT_MAX_STEPS,
    }),
  );
  return summarise(result, startedAt);
}

/** The booking agent: read and write tools, used by WhatsApp. */
export async function runBookingAgent(
  messages: ConciergeMessage[],
  options: {
    today: string;
    guestPhone: string;
    channel: "web" | "whatsapp";
    /** Photos this guest was sent lately, so send-photos does not repeat them unasked. */
    recentPhotos?: RecentPhoto[];
  },
): Promise<AgentRun> {
  const startedAt = Date.now();
  // One context for both attempts: they answer the same guest message, so the same turn.
  const requestContext = buildGuestContext({ phone: options.guestPhone, channel: options.channel });
  const photos: PhotoToSend[] = [];
  requestContext.set(PHOTO_OUTBOX_KEY, photos);
  requestContext.set(RECENT_PHOTOS_KEY, options.recentPhotos ?? []);
  const result = await generateFromData((providerOptions) =>
    getBookingAgent().generate(messages, {
      instructions: buildWhatsappInstructions(options.today),
      providerOptions,
      requestContext,
      prepareStep: (step) => groundFirstStep(step, WHATSAPP_FIRST_STEP_TOOLS),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      maxSteps: AGENT_MAX_STEPS,
    }),
  );
  return { ...summarise(result, startedAt), photos };
}
