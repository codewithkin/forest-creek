import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createBooking, prisma, recordPaynowPaid } from "@forest-creek/db";

import { inventedLinks } from "./grounding";
import { lookUpBookingTool } from "./tools";

const PREFIX = "ai-tools-test";
const SITE = process.env.CORS_ORIGIN ?? "http://localhost:3001";

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { guestEmail: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
}

let roomId: string;
beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  await cleanup();
});
afterAll(cleanup);

const lookUp = (reference: string) =>
  (lookUpBookingTool.execute as (input: { reference: string }, context: unknown) => Promise<Record<string, unknown>>)(
    { reference },
    {},
  );

describe("look-up-booking and receipts", () => {
  test("no receipts link until something is paid, then one the guard lets through", async () => {
    const booking = await createBooking({
      guestName: "Tools Guest",
      guestEmail: `${PREFIX}-1@example.com`,
      roomId,
      checkIn: "2058-06-10",
      checkOut: "2058-06-12",
      guests: 1,
      activityIds: [],
      paymentMethod: "ecocash",
      channel: "whatsapp",
      policyAccepted: true,
    });

    const unpaid = await lookUp(booking.reference);
    expect(unpaid.receiptsUrl).toBeUndefined();

    const charge = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paynowChargeAmount: booking.depositAmount,
        paynowPollUrl: `https://www.paynow.co.zw/Interface/CheckPayment/?guid=tools-${booking.reference}`,
        paynowReference: "PN-tools",
      },
    });
    await recordPaynowPaid(charge, "paid");

    const paid = await lookUp(booking.reference);
    expect(paid.receiptsUrl).toBe(new URL(`/pay/${booking.reference}`, SITE).toString());
    // The agent may send it: it is the booking's own page.
    expect(inventedLinks(`Your receipt: ${paid.receiptsUrl}`, SITE)).toEqual([]);
  });
});
