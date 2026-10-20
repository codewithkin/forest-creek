import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { extractReferences, HANDOFF_REPLY } from "@forest-creek/ai/grounding";

/**
 * Live: a reply the grounding guard blocks gets one corrected attempt in the
 * same turn (runBookingAgent's `check`). Run with `pnpm --filter agent test:e2e`.
 * Costs real tokens. See booking.test.ts for why this lives outside ./src.
 */
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY_FOR_E2E ?? "";

const { prisma } = await import("@forest-creek/db");
const { handleIncomingMessage } = await import("../src/reply");
const { runBookingAgent, todayInHarare } = await import("@forest-creek/ai");

const PHONE = "263700000078";
const SESSION_ID = `whatsapp:${PHONE}`;
const GUEST_EMAIL = "e2e-correction@example.com";
const enabled = (process.env.OPENROUTER_API_KEY ?? "").length > 0;

async function cleanup() {
  await prisma.chatMessage.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.pendingConfirmation.deleteMany({ where: { guest: { contains: PHONE } } });
  const bookings = await prisma.booking.findMany({ where: { guestEmail: GUEST_EMAIL }, select: { id: true } });
  await prisma.paymentEvent.deleteMany({ where: { bookingId: { in: bookings.map((booking) => booking.id) } } });
  await prisma.booking.deleteMany({ where: { guestEmail: GUEST_EMAIL } });
}

async function say(body: string) {
  const result = await handleIncomingMessage({ chatId: `${PHONE}@c.us`, body });
  if (!result.handled) throw new Error(`message not handled: ${result.reason}`);
  console.log(`\n  guest > ${body}\n  guide > ${result.reply}`);
  if (result.groundingBlocked) console.log(`  [still blocked after the retry: ${result.groundingBlocked}]`);
  return result;
}

async function expectEveryQuotedReferenceIsReal() {
  const sent = await prisma.chatMessage.findMany({ where: { sessionId: SESSION_ID, sender: "ai" } });
  const quoted = [...new Set(sent.flatMap((message) => extractReferences(message.content)))];
  for (const reference of quoted) {
    expect(await prisma.booking.findUnique({ where: { reference } })).not.toBeNull();
  }
}

beforeAll(cleanup);
afterAll(cleanup);

describe.skipIf(!enabled)("a blocked reply gets one corrected attempt", () => {
  test(
    "the retry is the same turn: it can never confirm a booking the guest has not confirmed",
    async () => {
      const reasons: string[] = [];
      const run = await runBookingAgent(
        [
          {
            role: "user",
            content: `Please book the family room at Forest Creek Lodge from 2031-11-10 to 2031-11-12 for 2 people. Name Tafara Moyo, email ${GUEST_EMAIL}, EcoCash.`,
          },
        ],
        {
          today: todayInHarare(),
          channel: "whatsapp",
          guestPhone: `+${PHONE}`,
          chatSessionId: SESSION_ID,
          // Block the first reply whatever it says, as grounding would an invented reference.
          check: async (candidate) => {
            if (reasons.length > 0) return undefined;
            reasons.push(candidate.text);
            return "it quoted the booking reference FC-ZZZZZZ, which does not exist";
          },
        },
      );
      console.log(`\n  first > ${reasons[0]}\n  retry > ${run.text}\n  tools: ${run.toolsCalled.join(", ")}`);
      expect(reasons).toHaveLength(1);
      expect(run.text.length).toBeGreaterThan(0);
      expect(run.text).not.toContain("FC-ZZZZZZ");
      // create-booking's first call only reads back; a retry in the same turn must not book.
      expect(await prisma.booking.findFirst({ where: { guestEmail: GUEST_EMAIL } })).toBeNull();
      await prisma.pendingConfirmation.deleteMany({ where: { guest: { contains: PHONE } } });
    },
    240_000,
  );

  test(
    "seen live: 'Try the ecocash payment again' after a read-back is answered, not handed off",
    async () => {
      await say("Is the family room at Forest Creek Lodge free from 2031-11-10 to 2031-11-12 for 2 people?");
      await say(`Book it please. Tafara Moyo, ${GUEST_EMAIL}, EcoCash on 0777123456.`);
      const result = await say("Try the ecocash payment again");
      expect(result.reply).not.toBe(HANDOFF_REPLY);
      await expectEveryQuotedReferenceIsReal();
    },
    360_000,
  );
});
