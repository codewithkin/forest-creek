import { afterAll, beforeAll, expect, test } from "bun:test";

import {
  buildGuestContext,
  changePaymentMethodTool,
  createBookingTool,
  listMyBookingsTool,
  lookUpBookingTool,
} from "@forest-creek/ai";
import { getPropertyBySlug, getRooms, prisma } from "@forest-creek/db";

/**
 * A website guest has no phone the assistant knows them by: they are the chat
 * session they book in. The same tools as WhatsApp, run the way Mastra runs them.
 */
const SESSION = "web-guest-test-session";
const OTHER_SESSION = "web-guest-test-other";
const EMAIL = "web-guest-test@example.com";

type Tool = { execute?: unknown };
let turns = 0;
const runIn = (chatSessionId: string, tool: Tool, input: unknown) =>
  (tool.execute as (i: unknown, c: unknown) => Promise<Record<string, unknown>>)(input, {
    requestContext: buildGuestContext({ chatSessionId, channel: "web", turnId: `web-turn-${++turns}` }),
  });

let propertySlug: string;
let tier: string;

async function cleanup() {
  await prisma.pendingConfirmation.deleteMany({ where: { guest: { in: [SESSION, OTHER_SESSION] } } });
  await prisma.booking.deleteMany({ where: { guestEmail: EMAIL } });
}

beforeAll(async () => {
  const property = await getPropertyBySlug("forest-creek");
  if (!property) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  propertySlug = property.slug;
  tier = (await getRooms(property.id))[0]!.tier;
  await cleanup();
});
afterAll(cleanup);

test("a website guest books in the chat, with the phone they gave, and the booking is that chat's", async () => {
  const input = {
    propertySlug,
    roomTier: tier,
    checkIn: "2037-05-10",
    checkOut: "2037-05-12",
    guests: 1,
    guestName: "Web Guest",
    guestEmail: EMAIL,
    activitySlugs: [],
    paymentMethod: "ecocash",
    contactPhone: "+263 77 111 2222",
  };
  expect((await runIn(SESSION, createBookingTool, input)).needsConfirmation).toBe(true);
  const booked = await runIn(SESSION, createBookingTool, input);
  expect(booked.ok).toBe(true);

  const stored = await prisma.booking.findUnique({ where: { reference: String(booked.reference) } });
  expect(stored).toMatchObject({ guestPhone: "+263 77 111 2222", chatSessionId: SESSION, channel: "web" });

  // Their own: listed, named, and theirs to change.
  const mine = await runIn(SESSION, listMyBookingsTool, {});
  expect((mine.bookings as { reference: string }[]).map((b) => b.reference)).toContain(booked.reference);
  expect((await runIn(SESSION, lookUpBookingTool, { reference: booked.reference })).guestName).toBe("Web Guest");
  expect((await runIn(SESSION, changePaymentMethodTool, { reference: booked.reference, method: "visa" })).ok).toBe(true);

  // Another visitor: not listed, not named, not changed.
  expect(((await runIn(OTHER_SESSION, listMyBookingsTool, {})).bookings as unknown[]).length).toBe(0);
  expect((await runIn(OTHER_SESSION, lookUpBookingTool, { reference: booked.reference })).guestName).toBeUndefined();
  expect((await runIn(OTHER_SESSION, changePaymentMethodTool, { reference: booked.reference, method: "ecocash" })).ok).toBe(false);
});

test("one visitor's read-back can never be confirmed by another", async () => {
  const input = {
    propertySlug,
    roomTier: tier,
    checkIn: "2037-06-10",
    checkOut: "2037-06-12",
    guests: 1,
    guestName: "Web Guest",
    guestEmail: EMAIL,
    activitySlugs: [],
    paymentMethod: "ecocash",
    contactPhone: "+263 77 111 2222",
  };
  await runIn(SESSION, createBookingTool, input);
  // The same details from a different chat are a fresh read-back, not a booking.
  expect((await runIn(OTHER_SESSION, createBookingTool, input)).needsConfirmation).toBe(true);
});
