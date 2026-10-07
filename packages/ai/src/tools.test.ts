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

describe("list-day-visits", () => {
  test("says when a price is still to be announced, and where guests ask", async () => {
    const { createDayVisit, getProperties } = await import("@forest-creek/db");
    const [property] = await getProperties();
    await prisma.dayVisit.deleteMany({ where: { slug: `${PREFIX}-day` } });
    await createDayVisit({ propertyId: property!.id, slug: `${PREFIX}-day`, name: "Tools Day", description: "A day out." });
    try {
      const { listDayVisitsTool } = await import("./tools");
      const result = (await (listDayVisitsTool.execute as (input: object, context: unknown) => Promise<{
        dayVisits: { name: string; pricePerPersonUsd: number | null; priceToBeAnnounced: boolean }[];
        requestPageUrl: string;
      }>)({}, {}));
      expect(result.dayVisits.find((visit) => visit.name === "Tools Day")).toMatchObject({
        pricePerPersonUsd: null,
        priceToBeAnnounced: true,
      });
      expect(result.requestPageUrl).toBe(new URL("/day-visits", SITE).toString());
      expect(inventedLinks(`Ask here: ${result.requestPageUrl}`, SITE)).toEqual([]);
    } finally {
      await prisma.dayVisit.deleteMany({ where: { slug: `${PREFIX}-day` } });
    }
  });
});

describe("send-photos", () => {
  const SLUG = `${PREFIX}-photos`;
  type Queued = { path: string; subject: string; number: number; total: number };
  const send = async (input: object, outbox?: Queued[]) => {
    const { sendPhotosTool, PHOTO_OUTBOX_KEY } = await import("./photos");
    const context = outbox ? { requestContext: { get: (key: string) => (key === PHOTO_OUTBOX_KEY ? outbox : undefined) } } : {};
    return (sendPhotosTool.execute as (i: object, c: unknown) => Promise<Record<string, unknown>>)(input, context);
  };

  let propertySlug: string;
  beforeAll(async () => {
    await prisma.property.deleteMany({ where: { slug: SLUG } });
    const property = await prisma.property.create({
      data: {
        slug: SLUG, name: "Photo House", tagline: "-", description: "-", location: "-", phone: "-", email: "p@example.com",
        heroImage: "/media/house-cover.jpg", gallery: ["/media/house-cover.jpg", "/media/house-2.jpg"],
      },
    });
    await prisma.room.create({
      data: {
        propertyId: property.id, tier: "family", name: "Family Room", description: "-", pricePerNight: 100, capacity: 4,
        bedType: "-", amenities: [], image: "https://cdn.example.com/f1.jpg",
        images: ["https://cdn.example.com/f1.jpg", "https://cdn.example.com/f2.jpg", "https://cdn.example.com/f3.jpg",
          "https://cdn.example.com/f4.jpg", "https://cdn.example.com/f5.jpg"],
      },
    });
    propertySlug = SLUG;
  });
  afterAll(() => prisma.property.deleteMany({ where: { slug: SLUG } }));

  test("one, then 'more' carries on where it stopped", async () => {
    const outbox: Queued[] = [];
    const first = await send({ propertySlug, roomTier: "family", count: 1, startAt: 0 }, outbox);
    expect(first).toMatchObject({ ok: true, sending: 1, totalPhotos: 5, nextStartAt: 1, subject: "Family Room at Photo House" });
    const more = await send({ propertySlug, roomTier: "family", count: 3, startAt: 1 }, outbox);
    expect(more).toMatchObject({ sending: 3, photoNumbers: "2–4", nextStartAt: 4 });
    expect(outbox.map((photo) => photo.number)).toEqual([1, 2, 3, 4]);
    expect(String(more.howToReply)).toContain("1 more");
    const rest = await send({ propertySlug, roomTier: "family", count: 10, startAt: 4 }, outbox);
    expect(rest).toMatchObject({ sending: 1, nextStartAt: null });
    expect((await send({ propertySlug, roomTier: "family", count: 3, startAt: 5 }, outbox)).sending).toBe(0);
  });

  test("no room means the property's own photos, cover first and never twice", async () => {
    const outbox: Queued[] = [];
    expect(await send({ propertySlug, count: 10, startAt: 0 }, outbox)).toMatchObject({ sending: 2, totalPhotos: 2 });
    expect(outbox.map((photo) => photo.path)).toEqual(["/media/house-cover.jpg", "/media/house-2.jpg"]);
  });

  test("a room that does not exist, and the website (no WhatsApp), are refused", async () => {
    expect(await send({ propertySlug, roomTier: "penthouse", count: 3, startAt: 0 }, [])).toMatchObject({ ok: false });
    expect(String((await send({ propertySlug, count: 3, startAt: 0 })).error)).toContain("only be sent on WhatsApp");
  });

  test("one reply never carries more than 15 photos", async () => {
    const outbox: Queued[] = Array.from({ length: 14 }, (_, n) => ({ path: `x${n}`, subject: "x", number: n + 1, total: 14 }));
    expect((await send({ propertySlug, roomTier: "family", count: 5, startAt: 0 }, outbox)).sending).toBe(1);
  });
});
