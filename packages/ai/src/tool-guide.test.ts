import { describe, expect, test } from "bun:test";

import { TOOL_GUIDE, toolGuide } from "./tool-guide";
import { buildBookingInstructions, whatsappAgentTools } from "./whatsapp-agent";

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
    { name: "website chat", tools: whatsappAgentTools, prompt: buildBookingInstructions("web", "2026-10-16") },
    { name: "WhatsApp agent", tools: whatsappAgentTools, prompt: buildBookingInstructions("whatsapp", "2026-10-16") },
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

  test("the website chat books and takes payments like WhatsApp, and asks for the phone WhatsApp already has", () => {
    const web = buildBookingInstructions("web", "2026-10-16");
    const whatsapp = buildBookingInstructions("whatsapp", "2026-10-16");
    for (const prompt of [web, whatsapp]) {
      expect(prompt).toContain("- create-booking: ");
      expect(prompt).toContain("- request-payment: ");
    }
    expect(web).toContain("contactPhone");
    expect(web).not.toContain("WhatsApp number they're texting from");
    expect(whatsapp).toContain("Their phone number you already have");
  });
});

describe("what may open a WhatsApp turn", () => {
  test("any tool but send-photos — a payment can start at once, photos never go out unasked", async () => {
    const { WHATSAPP_FIRST_STEP_TOOLS } = await import("./run");
    expect(WHATSAPP_FIRST_STEP_TOOLS).not.toContain("send-photos");
    expect(WHATSAPP_FIRST_STEP_TOOLS).toEqual(expect.arrayContaining(["request-payment", "create-booking", "check-availability"]));
  });
});
