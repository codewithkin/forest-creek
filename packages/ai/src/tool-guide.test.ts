import { describe, expect, test } from "bun:test";

import { buildInstructions, conciergeAgentTools } from "./agent";
import { TOOL_GUIDE, toolGuide } from "./tool-guide";
import { buildWhatsappInstructions, whatsappAgentTools } from "./whatsapp-agent";

describe("toolGuide", () => {
  test("prints one line per tool, by the id the model is offered", () => {
    const guide = toolGuide(["list-rooms", "send-photos"]);
    expect(guide).toContain(`- list-rooms: ${TOOL_GUIDE["list-rooms"]}`);
    expect(guide).toContain(`- send-photos: ${TOOL_GUIDE["send-photos"]}`);
    expect(guide).not.toContain("create-booking");
  });

  test("a tool with no guide line fails loudly instead of being left to guesswork", () => {
    expect(() => toolGuide(["list-rooms", "brand-new-tool"])).toThrow(/brand-new-tool/);
  });
});

describe("each agent is told about exactly the tools it has", () => {
  const cases = [
    { name: "website concierge", tools: conciergeAgentTools, prompt: buildInstructions("2026-10-16") },
    { name: "WhatsApp agent", tools: whatsappAgentTools, prompt: buildWhatsappInstructions("2026-10-16") },
  ];

  for (const { name, tools, prompt } of cases) {
    test(name, () => {
      const ids = Object.keys(tools);
      for (const id of ids) expect(prompt).toContain(`- ${id}: `);
      // Nothing it lacks is advertised.
      for (const id of Object.keys(TOOL_GUIDE).filter((candidate) => !ids.includes(candidate))) {
        expect(prompt).not.toContain(`- ${id}: `);
      }
    });
  }

  test("the website concierge reads only: it can quote, never book, charge or change", () => {
    const ids = Object.keys(conciergeAgentTools);
    expect(ids).toEqual(expect.arrayContaining(["get-payment-details", "quote-cancellation", "quote-date-change"]));
    for (const writes of ["create-booking", "request-payment", "change-payment-method"]) expect(ids).not.toContain(writes);
  });
});
