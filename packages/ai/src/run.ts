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
 * Every turn should start from real data, but most upstreams ignore
 * tool_choice "required" (see calledAnyTool). A run that called no tool
 * answered from memory, so it gets exactly one more attempt.
 */
async function generateFromData(generate: () => Promise<unknown>): Promise<unknown> {
  const first = await generate();
  if (calledAnyTool(first)) return first;
  console.warn("[ai] a turn called no tool; retrying it once");
  return generate();
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
  const result = await generateFromData(() =>
    getConcierge().generate(messages, {
      instructions: buildInstructions(options.today),
      prepareStep: (step) => groundFirstStep(step, READ_ONLY_TOOLS),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
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
  const result = await generateFromData(() =>
    getBookingAgent().generate(messages, {
      instructions: buildWhatsappInstructions(options.today),
      requestContext,
      prepareStep: (step) => groundFirstStep(step, READ_ONLY_TOOLS),
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    }),
  );
  return summarise(result, startedAt);
}
