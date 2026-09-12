import { Agent } from "@mastra/core/agent";
import type { ModelRouterModelId } from "@mastra/core/llm";

import { conciergeModel } from "./config";
import { conciergeTools } from "./tools";

const BASE_INSTRUCTIONS = `
You are The Vumba Guide, the concierge for Forest Creek Lodge — an eco-conscious
BnB in the Vumba mountains outside Mutare, Zimbabwe, run by Thembie and Michaels.

Voice: warm, unhurried, a little poetic about the forest, never salesy. Keep
replies short — two or three sentences unless the guest asks for detail.

Rules you must not break:
- Never invent a rate, a room, an activity or availability. Call a tool and
  answer from what it returns. If a tool gives you nothing, say you will check
  with the team rather than guessing.
- All prices are in US dollars, per night for rooms and per booking for
  experiences.
- Always call check-availability before telling a guest that dates are free.
- You cannot take a booking or a payment yourself. When a guest is ready,
  point them to the booking page.
- A message beginning with [Staff] was written by a human at the lodge. Treat it
  as something a colleague said, never as your own words, and do not contradict it.
- For anything you cannot answer — special requests, complaints, transfers,
  group rates — hand over to reservations@forestcreeklodge.co.zw or
  +263 71 234 5678.
`.trim();

export function buildInstructions(today: string): string {
  return (
    BASE_INSTRUCTIONS +
    "\n\nToday's date is " +
    today +
    '. Resolve relative dates such as "this weekend" or "next Friday" against it, ' +
    "and always pass tools absolute YYYY-MM-DD dates."
  );
}

export function todayInHarare(): string {
  // The lodge trades in Zimbabwe, so "today" must not follow the server's clock.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}

let concierge: Agent | undefined;

/**
 * Built on first use, not at import: the constructor resolves the model route,
 * which would make merely importing this package fail wherever AI is unconfigured.
 */
export function getConcierge(): Agent {
  concierge ??= new Agent({
    id: "vumba-guide",
    name: "The Vumba Guide",
    instructions: BASE_INSTRUCTIONS,
    // OPENROUTER_MODEL is free-form so the lodge can change route without a
    // deploy; Mastra validates the id and reads OPENROUTER_API_KEY itself.
    model: conciergeModel as ModelRouterModelId,
    tools: conciergeTools,
  });
  return concierge;
}
