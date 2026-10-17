import { env } from "@forest-creek/env/server";

/**
 * The one model both assistants run on, through OpenRouter. Hard-coded on
 * purpose: an environment variable let a deployment quietly keep an older
 * model. Claude Haiku 5.5 replaced DeepSeek V3.2 (which took 25-70s a turn
 * live, and whose upstreams mostly ignored tool_choice); it is also cheaper per
 * token on OpenRouter ($0.10/M in, $0.50/M out against $0.26/$0.80).
 * Mastra resolves the id through models.dev when the agent is built.
 */
export const conciergeModel = "openrouter/anthropic/claude-haiku-5.5";

export function isConciergeConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}
