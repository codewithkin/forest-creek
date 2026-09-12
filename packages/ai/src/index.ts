import { env } from "@forest-creek/env/server";

export const conciergeModel = env.OPENROUTER_MODEL;

export function isConciergeConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}
