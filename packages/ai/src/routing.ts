/**
 * Import-free, so it can be unit tested without the validated environment.
 */

export type Routing = { openrouter: { provider: { order?: string[]; ignore?: string[] } } };

/**
 * Chosen from eval pass rates across five full runs (about 250 graded replies):
 * StreamLake and SiliconFlow failed least, AtlasCloud next; Novita failed most
 * and served every tool-less reply that survived a retry. Merely ignoring
 * Novita sent most traffic to Friendli, which leaked its reasoning into
 * replies. Fallbacks stay on, so a busy or failing upstream never blocks a guest.
 */
const DEEPSEEK: Routing = {
  openrouter: { provider: { order: ["StreamLake", "SiliconFlow", "AtlasCloud"], ignore: ["Novita"] } },
};

/**
 * SiliconFlow was the only upstream that honoured tool_choice "required" in a
 * direct probe, so a retry prefers it. Fallbacks stay on: an outage there must
 * not take the assistants down.
 */
const DEEPSEEK_RETRY: Routing = {
  openrouter: { provider: { order: ["SiliconFlow"], ignore: ["Novita"] } },
};

/**
 * Upstream preferences for the configured model. The DeepSeek list names
 * DeepSeek hosts only; any other model (e.g. a Claude model, served by its own
 * vendor) gets OpenRouter's default routing rather than a list of hosts that
 * do not carry it.
 */
export function routingFor(model: string, attempt: "first" | "retry"): Routing | undefined {
  if (!/deepseek/i.test(model)) return undefined;
  return attempt === "first" ? DEEPSEEK : DEEPSEEK_RETRY;
}
