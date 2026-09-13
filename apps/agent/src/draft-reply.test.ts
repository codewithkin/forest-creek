import { describe, expect, test } from "bun:test";

import type { ToolFacts } from "@forest-creek/ai";

import { draftReply, FAILURE_REPLY } from "./reply";

const nothing: ToolFacts = { bookings: [], payments: [] };

const booked: ToolFacts = {
  bookings: [
    {
      reference: "FC-PLSL4J",
      property: "Forest Creek Lodge",
      room: "Standard Room",
      checkIn: "2041-02-01",
      checkOut: "2041-02-03",
      totalAmountUsd: 180,
    },
  ],
  payments: [
    {
      reference: "FC-PLSL4J",
      amountUsd: 180,
      instructions: "The lodge will send payment details shortly. Quote your reference when you pay.",
      paymentLink: null,
    },
  ],
};

describe("draftReply", () => {
  test("keeps the model's own reply when it wrote one", () => {
    expect(draftReply("Your stay is held under FC-PLSL4J.", booked)).toBe(
      "Your stay is held under FC-PLSL4J.",
    );
  });

  test("a booked guest is never told something went wrong, even when the model wrote nothing", () => {
    const reply = draftReply("", booked);
    expect(reply).not.toBe(FAILURE_REPLY);
    expect(reply).toContain("FC-PLSL4J");
    expect(reply).toContain("$180");
    expect(reply).toContain("held, not confirmed");
  });

  test("with no reply and nothing done, it apologises and hands over", () => {
    expect(draftReply("", nothing)).toBe(FAILURE_REPLY);
  });
});
