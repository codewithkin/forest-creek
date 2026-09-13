import { getConcierge, buildInstructions } from "./agent";
import { buildGuestContext } from "./booking-tools";
import type { ConciergeMessage } from "./history";
import { buildWhatsappInstructions, getBookingAgent } from "./whatsapp-agent";

/**
 * Everything worth knowing about one agent turn. Both production call sites go
 * through these runners, so the evals measure exactly what guests get — and
 * which model actually answered is observable rather than assumed.
 */
export type AgentRun = {
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

type OpenRouterMetadata = {
  openrouter?: { provider?: string; usage?: { cost?: number } };
};

type RawRun = {
  text?: string;
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
    text: (result.text ?? "").trim(),
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
  const result = await getConcierge().generate(messages, {
    instructions: buildInstructions(options.today),
  });
  return summarise(result, startedAt);
}

/** The booking agent: read and write tools, used by WhatsApp. */
export async function runBookingAgent(
  messages: ConciergeMessage[],
  options: { today: string; guestPhone: string; channel: "web" | "whatsapp" },
): Promise<AgentRun> {
  const startedAt = Date.now();
  const result = await getBookingAgent().generate(messages, {
    instructions: buildWhatsappInstructions(options.today),
    requestContext: buildGuestContext({ phone: options.guestPhone, channel: options.channel }),
  });
  return summarise(result, startedAt);
}
