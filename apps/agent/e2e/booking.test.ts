import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { extractReferences } from "@forest-creek/ai/grounding";

/**
 * Live conversation against the real model. Lives outside ./src so the default
 * `bun test ./src` never loads it: bun runs every loaded test file in one
 * process, and restoring the API key below would otherwise leak into — and
 * un-hermetic — the whole suite, even with these tests skipped.
 *
 * Run explicitly with `pnpm --filter agent test:e2e`. Costs real tokens.
 */
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY_FOR_E2E ?? "";

const { prisma } = await import("@forest-creek/db");
const { handleIncomingMessage } = await import("../src/reply");

const PHONE = "263700000077";
const CHAT_ID = `${PHONE}@c.us`;
const SESSION_ID = `whatsapp:${PHONE}`;
const GUEST_EMAIL = "e2e-guest@example.com";

const enabled = (process.env.OPENROUTER_API_KEY ?? "").length > 0;

async function cleanup() {
  await prisma.chatMessage.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.booking.deleteMany({ where: { guestEmail: GUEST_EMAIL } });
}

async function say(body: string): Promise<string> {
  const result = await handleIncomingMessage({ chatId: CHAT_ID, body });
  if (!result.handled) throw new Error(`message not handled: ${result.reason}`);
  console.log(`\n  guest > ${body}\n  guide > ${result.reply}`);
  if (result.groundingBlocked) {
    console.log(`  [grounding replaced that reply: ${result.groundingBlocked}]`);
  }
  return result.reply;
}

/** The safety property that matters most: no guest is ever shown a fake reference. */
async function expectEveryQuotedReferenceIsReal() {
  const sent = await prisma.chatMessage.findMany({
    where: { sessionId: SESSION_ID, sender: "ai" },
  });
  const quoted = [...new Set(sent.flatMap((message) => extractReferences(message.content)))];
  const missing: string[] = [];
  for (const reference of quoted) {
    if (!(await prisma.booking.findUnique({ where: { reference } }))) missing.push(reference);
  }
  expect(missing).toEqual([]);
}

beforeAll(cleanup);
afterAll(cleanup);

describe.skipIf(!enabled)("live WhatsApp booking conversation", () => {
  test(
    "takes a booking end to end and issues payment instructions",
    async () => {
      await say("Hi! What lodges do you have?");

      await say(
        "Forest Creek please. Is the family room free from 2031-12-01 to 2031-12-03 for 2 people?",
      );

      await say(
        `Great, please book it. My name is Tafara Moyo, email ${GUEST_EMAIL}, and I'll pay by bank transfer.`,
      );

      // The prompt tells the agent to read the booking back before creating it,
      // so an explicit confirmation may be required.
      let booking = await prisma.booking.findFirst({ where: { guestEmail: GUEST_EMAIL } });
      if (!booking) {
        await say("Yes, that's all correct. Please go ahead and book it.");
        booking = await prisma.booking.findFirst({ where: { guestEmail: GUEST_EMAIL } });
      }

      // Checked before anything else: even if the model misbehaves, it must
      // never have told the guest about a booking that does not exist.
      await expectEveryQuotedReferenceIsReal();

      expect(booking).not.toBeNull();
      expect(booking!.channel).toBe("whatsapp");
      // Came from the request context, never from the model.
      expect(booking!.guestPhone).toBe(`+${PHONE}`);
      expect(booking!.propertyName).toBe("Forest Creek Lodge");
      expect(booking!.nights).toBe(2);
      expect(booking!.guests).toBe(2);
      expect(booking!.bookingStatus).toBe("pending");
      expect(booking!.paymentStatus).toBe("pending");

      // Asking how to pay must produce a real payment request against the booking.
      if (!booking!.paymentRequestedAt) {
        await say("How do I pay?");
        booking = await prisma.booking.findFirst({ where: { guestEmail: GUEST_EMAIL } });
      }
      expect(booking!.paymentRequestedAt).not.toBeNull();

      await expectEveryQuotedReferenceIsReal();

      // The whole exchange is in the staff inbox, starting with the guest.
      const history = await prisma.chatMessage.findMany({
        where: { sessionId: SESSION_ID },
        orderBy: { createdAt: "asc" },
      });
      expect(history.length).toBeGreaterThanOrEqual(6);
      expect(history[0]?.sender).toBe("guest");
    },
    300_000,
  );

  test(
    "refuses to invent a lodge it does not have",
    async () => {
      const reply = await say("Do you have a beach villa in Victoria Falls?");
      expect(reply.toLowerCase()).not.toContain("victoria falls beach villa");
      await expectEveryQuotedReferenceIsReal();
    },
    120_000,
  );
});
