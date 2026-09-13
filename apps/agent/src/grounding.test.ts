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
const nothing: ToolFacts = { bookings: [], payments: [] };
const noSuchBooking = async () => null;

const FALLBACK_INSTRUCTIONS =
  "The lodge will send payment details shortly. Quote your reference when you pay.";

describe("extractReferences", () => {
  test("finds references, upper-cases and de-duplicates them", () => {
    expect(extractReferences("Ref fc-vj4qg5, again FC-VJ4QG5, and FC-GZCDMV")).toEqual([
      "FC-VJ4QG5",
      "FC-GZCDMV",
    ]);
  });

  test("still catches reference-shaped strings outside the real alphabet", () => {
    // A hallucination is not bound by our I/O/0/1-free alphabet.
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
            instructions: FALLBACK_INSTRUCTIONS,
            paymentLink: null,
          },
        },
      },
    ]);

    expect(facts.bookings).toHaveLength(1);
    expect(facts.bookings[0]?.reference).toBe("FC-GZCDMV");
    expect(facts.payments[0]?.paymentLink).toBeNull();
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
    // Verbatim shape of what the model sent without ever calling create-booking.
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
        payments: [
          {
            reference: "FC-GZCDMV",
            amountUsd: 90,
            instructions: FALLBACK_INSTRUCTIONS,
            paymentLink: null,
          },
        ],
      },
      lookupReference: noSuchBooking,
    });

    expect(grounded.blocked).toBe(true);
    // The real booking survives; the fabricated account does not.
    expect(grounded.reply).toContain("FC-GZCDMV");
    expect(grounded.reply).toContain(FALLBACK_INSTRUCTIONS);
    expect(grounded.reply).not.toContain("9999999999");
  });

  test("allows bank details that came verbatim from request-payment", async () => {
    const instructions = "Pay into CBZ Bank, Account Number 4455667788, branch Mutare.";
    const grounded = await groundReply({
      reply: "Please pay into CBZ Bank, account number 4455667788, quoting FC-GZCDMV.",
      guestPhone: PHONE,
      guestMessage: "how do I pay?",
      facts: {
        bookings: [],
        payments: [
          { reference: "FC-GZCDMV", amountUsd: 90, instructions, paymentLink: null },
        ],
      },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(false);
  });

  test("blocks an account number that differs from the one the lodge configured", async () => {
    const instructions = "Pay into CBZ Bank, Account Number 4455667788, branch Mutare.";
    const grounded = await groundReply({
      reply: "Please pay into account number 4455667799.",
      guestPhone: PHONE,
      guestMessage: "how do I pay?",
      facts: {
        bookings: [],
        payments: [
          { reference: "FC-GZCDMV", amountUsd: 90, instructions, paymentLink: null },
        ],
      },
      lookupReference: noSuchBooking,
    });
    expect(grounded.blocked).toBe(true);
    expect(grounded.reply).not.toContain("4455667799");
  });
});

describe("buildFactualReply", () => {
  test("hands off when no tool actually did anything", () => {
    expect(buildFactualReply(nothing)).toBe(HANDOFF_REPLY);
  });

  test("includes the payment link when the lodge configured one", () => {
    const reply = buildFactualReply({
      bookings: [],
      payments: [
        {
          reference: "FC-GZCDMV",
          amountUsd: 90,
          instructions: FALLBACK_INSTRUCTIONS,
          paymentLink: "https://pay.example.com/fc-gzcdmv",
        },
      ],
    });
    expect(reply).toContain("https://pay.example.com/fc-gzcdmv");
    expect(reply).toContain("held, not confirmed");
  });
});
