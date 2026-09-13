import { getConcierge, buildInstructions } from "./agent";
import { buildGuestContext } from "./booking-tools";
import type { ConciergeMessage } from "./history";
import { finalReplyText } from "./reply-text";
import { calledAnyTool, groundFirstStep } from "./steps";
import { conciergeTools } from "./tools";
import { buildWhatsappInstructions, getBookingAgent } from "./whatsapp-agent";

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
};

/** Tools a forced first call may use: everything that only reads. */
const READ_ONLY_TOOLS = Object.keys(conciergeTools);

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

type Routing = { openrouter: { provider: { order?: string[]; ignore: string[] } } };

/**
 * In the evals, every reply that still called no tool after a retry was served
 * by Novita, so no turn is routed there.
 */
const ROUTING: Routing = { openrouter: { provider: { ignore: ["Novita"] } } };

/**
 * SiliconFlow was the only upstream that honoured tool_choice "required" in a
 * direct probe, so a retry prefers it. Fallbacks stay on: an outage there must
 * not take the assistants down.
 */
const RETRY_ROUTING: Routing = {
  openrouter: { provider: { order: ["SiliconFlow"], ignore: ["Novita"] } },
};

/**
 * Every turn should start from real data, but most upstreams ignore
 * tool_choice "required" (see calledAnyTool). A run that called no tool
 * answered from memory, so it gets exactly one more attempt, on the provider
 * most likely to call one.
 */
async function generateFromData(
  generate: (providerOptions: Routing) => Promise<unknown>,
): Promise<unknown> {
  const first = await generate(ROUTING);
  if (calledAnyTool(first)) return first;
  console.warn("[ai] a turn called no tool; retrying it once");
  return generate(RETRY_ROUTING);
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
  options: { today: string; guestPhone: string; channel: "web" | "whatsapp" },
): Promise<AgentRun> {
  const startedAt = Date.now();
  // One context for both attempts: they answer the same guest message, so the same turn.
  const requestContext = buildGuestContext({ phone: options.guestPhone, channel: options.channel });
  const result = await generateFromData((providerOptions) =>
    getBookingAgent().generate(messages, {
      instructions: buildWhatsappInstructions(options.today),
      providerOptions,
      requestContext,
      prepareStep: (step) => groundFirstStep(step, READ_ONLY_TOOLS),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      maxSteps: AGENT_MAX_STEPS,
    }),
  );
  return summarise(result, startedAt);
}
