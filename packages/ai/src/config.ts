import { env } from "@forest-creek/env/server";

/**
 * The one model both assistants run on, through OpenRouter. Hard-coded on
 * purpose: an environment variable let a deployment quietly keep an older
 * model. Claude Haiku 5.5 replaced DeepSeek V3.2 — it honours tool_choice
 * (DeepSeek's upstreams mostly ignored it), answers in a few seconds where
 * DeepSeek took 25-70, and costs less per token ($0.10/M in, $0.50/M out).
 * Mastra resolves the id through models.dev when the agent is built.
 */
export const conciergeModel = "openrouter/anthropic/claude-haiku-5.5";

export function isConciergeConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}
