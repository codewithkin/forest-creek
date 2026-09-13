import { describe, expect, test } from "bun:test";

import {
  buildFactualReply,
  collectToolFacts,
  extractReferences,
  groundReply,
  HANDOFF_REPLY,
  looksLikePaymentDetails,
  type ToolFacts,
} from "./grounding";

const PHONE = "+263700000077";
const nothing: ToolFacts = { bookings: [], payments: [], paymentChecks: [] };
const noSuchBooking = async () => null;

const PAYNOW_INSTRUCTIONS = "Check your phone for a payment prompt and enter your PIN to approve it.";

describe("extractReferences", () => {
  test("finds references, upper-cases and de-duplicates them", () => {
    expect(extractReferences("Ref fc-vj4qg5, again FC-VJ4QG5, and FC-GZCDMV")).toEqual([
      "FC-VJ4QG5",
      "FC-GZCDMV",
    ]);
  });

  test("still catches reference-shaped strings outside the real alphabet", () => {
    expect(extractReferences("your ref is FC-O0I1AB")).toEqual(["FC-O0I1AB"]);
  });

  test("finds nothing in ordinary text", () => {
    expect(extractReferences("The family room sleeps four.")).toEqual([]);
  });
});

describe("looksLikePaymentDetails", () => {
  test("flags account numbers, by keyword and by shape", () => {
    expect(looksLikePaymentDetails("Account Number: 1234567890")).toBe(true);
    expect(looksLikePaymentDetails("send it to 1234 5678 9012")).toBe(true);
  });

  test("flags bank routing identifiers", () => {
    expect(looksLikePaymentDetails("Swift Code: COBZZWHA")).toBe(true);
    expect(looksLikePaymentDetails("IBAN GB29NWBK60161331926819")).toBe(true);
  });

  test("does not flag the lodge's own phone number", () => {
    expect(looksLikePaymentDetails("Call us on +263 71 234 5678 any time.")).toBe(false);
  });

  test("does not flag dates, amounts or references", () => {
    expect(
      looksLikePaymentDetails("FC-VJ4QG5, 2031-12-01 to 2031-12-03, total $280 for 2 nights"),
    ).toBe(false);
  });
});

describe("collectToolFacts", () => {
  test("reads Mastra's payload-wrapped results", () => {
    const facts = collectToolFacts([
      {
        payload: {
          toolName: "createBooking",
          result: {
            ok: true,
            reference: "fc-gzcdmv",
            property: "Forest Creek Lodge",
            room: "Standard Room",
            checkIn: "2031-11-01",
            checkOut: "2031-11-02",
            totalAmountUsd: 90,
          },
        },
      },
      {
        payload: {
          toolName: "requestPayment",
          result: {
            ok: true,
            reference: "FC-GZCDMV",
            amountUsd: 90,
            instructions: PAYNOW_INSTRUCTIONS,
          },
        },
      },
      {
        payload: {
          toolName: "checkPaymentStatus",
          result: { ok: true, reference: "FC-GZCDMV", paid: true },
        },
      },
    ]);

    expect(facts.bookings).toHaveLength(1);
    expect(facts.bookings[0]?.reference).toBe("FC-GZCDMV");
    expect(facts.payments[0]?.instructions).toBe(PAYNOW_INSTRUCTIONS);
    expect(facts.paymentChecks).toEqual([{ reference: "FC-GZCDMV", paid: true }]);
  });

  test("records an unpaid check as unpaid, not as a missing fact", () => {
    const facts = collectToolFacts([
      { toolName: "check-payment-status", result: { ok: true, reference: "FC-GZCDMV", paid: false } },
    ]);
    expect(facts.paymentChecks).toEqual([{ reference: "FC-GZCDMV", paid: false }]);
  });

  test("ignores tool calls that failed", () => {
    const facts = collectToolFacts([
      { toolName: "createBooking", result: { ok: false, error: "Room is booked" } },
    ]);
    expect(facts).toEqual(nothing);
  });

  test("survives a missing or malformed toolResults", () => {
    expect(collectToolFacts(undefined)).toEqual(nothing);
    expect(collectToolFacts("nope")).toEqual(nothing);
  });
});

describe("groundReply", () => {
  test("passes an ordinary reply straight through", async () => {
    const reply = "The family room sleeps four and is $140 a night.";
    const grounded = await groundReply({
      reply,
      guestPhone: PHONE,
      guestMessage: "tell me about rooms",
      facts: nothing,
      lookupReference: noSuchBooking,
    });
    expect(grounded).toEqual({ blocked: false, reply });
  });

  test("blocks the production incident: invented reference and bank account", async () => {
    const reply = `Your booking reference is: FC-VJ4QG5

The room is now held for you. To confirm your booking, please pay the $280 USD via bank transfer within 48 hours.

Bank Transfer Details:
- Bank: CBZ Bank
- Account Name: Forest Creek Lodge
- Account Number: 1234567890
- Swift Code: COBZZWHA
- Reference: FC-VJ4QG5`;

    const grounded = await groundReply({
      reply,
      guestPhone: PHONE,
      guestMessage: "Yes, that's all correct. Please go ahead and book it.",
      facts: nothing,
      lookupReference: noSuchBooking,
    });

    expect(grounded.blocked).toBe(true);
    expect(grounded.reply).toBe(HANDOFF_REPLY);
    expect(grounded.reply).not.toContain("1234567890");
    expect(grounded.reply).not.toContain("FC-VJ4QG5");
    expect(grounded.reply).toContain("nothing has been booked");
  });

  test("lets the assistant repeat a reference the guest typed, even one that does not exist", async () => {
    // Eval regression: this correct reply was being replaced with "nothing has been booked".
    const grounded = await groundReply({
      reply: "I couldn't find a booking under FC-ZZZZ99 — could you double-check the code?",
      guestPhone: PHONE,
      guestMessage: "Can you check on my booking FC-ZZZZ99 please?",
      facts: nothing,
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(false);
  });

  test("allows a reference create-booking produced this turn", async () => {
    const grounded = await groundReply({
      reply: "Done — your reference is FC-GZCDMV.",
      guestPhone: PHONE,
      guestMessage: "yes book it",
      facts: {
        bookings: [
          {
            reference: "FC-GZCDMV",
            property: "Forest Creek Lodge",
            room: "Standard Room",
            checkIn: "2031-11-01",
            checkOut: "2031-11-02",
            totalAmountUsd: 90,
          },
        ],
        payments: [],
        paymentChecks: [],
      },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(false);
  });

  test("allows quoting the guest's own existing booking", async () => {
    const grounded = await groundReply({
      reply: "FC-GZCDMV is still waiting on payment.",
      guestPhone: PHONE,
      guestMessage: "what's happening with my booking?",
      facts: nothing,
      lookupReference: async () => ({ guestPhone: PHONE }),
    });
    expect(grounded.blocked).toBe(false);
  });

  test("refuses to surface another guest's real booking", async () => {
    const grounded = await groundReply({
      reply: "I found FC-GZCDMV for you.",
      guestPhone: PHONE,
      guestMessage: "do I have any bookings?",
      facts: nothing,
      lookupReference: async () => ({ guestPhone: "+263711111111" }),
    });
    expect(grounded.blocked).toBe(true);
    expect(grounded.reply).not.toContain("FC-GZCDMV");
  });

  test("an anonymous website visitor owns no bookings by phone", async () => {
    // Two nulls must not count as a match.
    const grounded = await groundReply({
      reply: "I found FC-GZCDMV for you.",
      guestPhone: null,
      guestMessage: "do I have any bookings?",
      facts: nothing,
      lookupReference: async () => ({ guestPhone: null }),
    });
    expect(grounded.blocked).toBe(true);
  });

  test("allows a reference the guest typed in themselves, even if booked on the web", async () => {
    const grounded = await groundReply({
      reply: "FC-GZCDMV is confirmed.",
      guestPhone: PHONE,
      guestMessage: "can you check FC-GZCDMV?",
      facts: nothing,
      lookupReference: async () => ({ guestPhone: null }),
    });
    expect(grounded.blocked).toBe(false);
  });

  test("rebuilds from real facts when a booking exists but the bank details were invented", async () => {
    const grounded = await groundReply({
      reply: "Booked as FC-GZCDMV! Pay into Account Number 9999999999 today.",
      guestPhone: PHONE,
      guestMessage: "yes go ahead",
      facts: {
        bookings: [
          {
            reference: "FC-GZCDMV",
            property: "Forest Creek Lodge",
            room: "Standard Room",
            checkIn: "2031-11-01",
            checkOut: "2031-11-02",
            totalAmountUsd: 90,
          },
        ],
        payments: [{ reference: "FC-GZCDMV", amountUsd: 90, instructions: PAYNOW_INSTRUCTIONS }],
        paymentChecks: [],
      },
      lookupReference: noSuchBooking,
    });

    expect(grounded.blocked).toBe(true);
    expect(grounded.reply).toContain("FC-GZCDMV");
    expect(grounded.reply).toContain(PAYNOW_INSTRUCTIONS);
    expect(grounded.reply).not.toContain("9999999999");
  });

  test("allows a mobile number that came verbatim from request-payment", async () => {
    const instructions = "A prompt was sent to 0777123456. Enter your PIN to approve it.";
    const grounded = await groundReply({
      reply: "A prompt was sent to 0777123456 for FC-GZCDMV — enter your PIN to approve it.",
      guestPhone: PHONE,
      guestMessage: "how do I pay?",
      facts: { bookings: [], payments: [{ reference: "FC-GZCDMV", amountUsd: 90, instructions }], paymentChecks: [] },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(false);
  });

  test("blocks a phone number that differs from the one Paynow was actually asked to charge", async () => {
    const instructions = "A prompt was sent to 0777123456. Enter your PIN to approve it.";
    const grounded = await groundReply({
      reply: "A prompt was sent to 0777999999 for FC-GZCDMV.",
      guestPhone: PHONE,
      guestMessage: "how do I pay?",
      facts: { bookings: [], payments: [{ reference: "FC-GZCDMV", amountUsd: 90, instructions }], paymentChecks: [] },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(true);
    expect(grounded.reply).not.toContain("0777999999");
  });

  test("blocks a claim that payment succeeded when check-payment-status never confirmed it", async () => {
    const grounded = await groundReply({
      reply: "Great news — payment received! Your stay is confirmed.",
      guestPhone: PHONE,
      guestMessage: "have I paid yet?",
      facts: nothing,
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(true);
  });

  test("allows a payment-succeeded claim once check-payment-status confirmed it this turn", async () => {
    const grounded = await groundReply({
      reply: "Payment received for FC-GZCDMV — your stay is confirmed.",
      guestPhone: PHONE,
      guestMessage: "have I paid yet?",
      facts: { bookings: [], payments: [], paymentChecks: [{ reference: "FC-GZCDMV", paid: true }] },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(false);
  });

  test("does not let an unpaid check-payment-status result excuse a payment-succeeded claim", async () => {
    const grounded = await groundReply({
      reply: "Payment received! You're all paid up.",
      guestPhone: PHONE,
      guestMessage: "have I paid yet?",
      facts: { bookings: [], payments: [], paymentChecks: [{ reference: "FC-GZCDMV", paid: false }] },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(true);
  });
});

describe("buildFactualReply", () => {
  test("hands off when no tool actually did anything", () => {
    expect(buildFactualReply(nothing)).toBe(HANDOFF_REPLY);
  });

  test("relays Paynow's own instructions and the held-until-paid caveat", () => {
    const reply = buildFactualReply({
      bookings: [],
      payments: [{ reference: "FC-GZCDMV", amountUsd: 90, instructions: PAYNOW_INSTRUCTIONS }],
      paymentChecks: [],
    });
    expect(reply).toContain(PAYNOW_INSTRUCTIONS);
    expect(reply).toContain("held, not confirmed");
  });

  test("says a confirmed payment plainly, and drops the held caveat once everything is paid", () => {
    const reply = buildFactualReply({
      bookings: [],
      payments: [{ reference: "FC-GZCDMV", amountUsd: 90, instructions: PAYNOW_INSTRUCTIONS }],
      paymentChecks: [{ reference: "FC-GZCDMV", paid: true }],
    });
    expect(reply).toContain("Payment received for FC-GZCDMV");
    expect(reply).not.toContain("held, not confirmed");
  });
});
