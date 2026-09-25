import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  answerDayVisit,
  createDayVisit,
  dayVisitPriceLine,
  deleteDayVisit,
  getGuestDayVisitView,
  listDayVisitBookings,
  prisma,
  requestDayVisit,
  setDayVisitActive,
  updateDayVisit,
  type DayVisit,
} from "./index";

const SLUG = "day-visit-test";
const EMAIL = "day-visit-test@example.com";
let propertyId: string;
let visit: DayVisit;

async function cleanup() {
  await prisma.dayVisitBooking.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.dayVisit.deleteMany({ where: { slug: { startsWith: SLUG } } });
}

beforeAll(async () => {
  const property = await prisma.property.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!property) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  propertyId = property.id;
  await cleanup();
  visit = await createDayVisit({
    propertyId,
    slug: SLUG,
    name: "Garden day",
    description: "The gardens, the pool and lunch, without a night's stay.",
  });
});
afterAll(cleanup);

/** The error a call fails with, or null — Bun's .rejects matcher hangs on these. */
const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: Error) => error.message);

const ask = (overrides: Partial<Parameters<typeof requestDayVisit>[0]> = {}) =>
  requestDayVisit(
    {
      dayVisitId: visit.id,
      visitDate: "2057-08-14",
      guests: 3,
      guestName: "Rudo Day",
      guestEmail: EMAIL,
      guestPhone: "+263 77 123 4567",
      ...overrides,
    },
    new Date("2057-08-01T08:00:00Z"),
  );

describe("the day visits staff set up", () => {
  test("a new one needs no photo and no price yet", () => {
    expect(visit.pricePerPerson).toBeNull();
    expect(visit.image).toBe("");
    expect(visit.active).toBe(true);
  });

  test("the price is spelled out for guests, or promised", () => {
    expect(dayVisitPriceLine(null, 3)).toContain("to be announced");
    expect(dayVisitPriceLine(15, 3)).toBe("Price: $15 per person — $45 for 3 guests");
    expect(dayVisitPriceLine(0, 1)).toBe("Price: no charge");
  });
});

describe("guests asking for a day visit", () => {
  test("a request gets an FD- reference, and emails to the guest and the property", async () => {
    const view = await ask();
    expect(view.reference).toMatch(/^FD-[A-Z2-9]{6}$/);
    expect(view).toMatchObject({ status: "requested", visitName: "Garden day", visitDate: "2057-08-14", pricePerPerson: null });
    // Like a stay's payment page: a reference never reveals who the guest is.
    expect(JSON.stringify(view)).not.toContain(EMAIL);
    expect(JSON.stringify(view)).not.toContain("Rudo");

    const row = await prisma.dayVisitBooking.findUniqueOrThrow({ where: { reference: view.reference } });
    const emails = await prisma.notification.findMany({ where: { dayVisitBookingId: row.id } });
    expect(emails.map((email) => email.audience).sort()).toEqual(["guest", "staff"]);
    const toGuest = emails.find((email) => email.audience === "guest")!;
    expect(toGuest.recipient).toBe(EMAIL);
    expect(toGuest.body).toContain("to be announced");
    expect(toGuest.body).toContain("not yet a confirmed visit");
    expect(emails.find((email) => email.audience === "staff")!.body).toContain("+263 77 123 4567");
  });

  test("a day already past, or a hidden visit, is refused", async () => {
    expect(await failure(ask({ visitDate: "2057-07-31" }))).toContain("already passed");
    await setDayVisitActive(visit.id, false);
    expect(await failure(ask())).toContain("not available");
    await setDayVisitActive(visit.id, true);
  });

  test("a published price is kept on the request, even if it changes later", async () => {
    await updateDayVisit({ id: visit.id, pricePerPerson: 20 });
    const view = await ask({ guests: 2 });
    await updateDayVisit({ id: visit.id, pricePerPerson: 25 });
    expect((await getGuestDayVisitView(view.reference))?.pricePerPerson).toBe(20);
    await updateDayVisit({ id: visit.id, pricePerPerson: null });
  });
});

describe("staff answering", () => {
  test("confirming quotes the price and tells the guest; a second answer is refused", async () => {
    const view = await ask();
    const row = await prisma.dayVisitBooking.findUniqueOrThrow({ where: { reference: view.reference } });

    const confirmed = await answerDayVisit(
      { id: row.id, status: "confirmed", pricePerPerson: 12, staffNote: "Bring swimwear." },
      "manager@example.com",
    );
    expect(confirmed).toMatchObject({ status: "confirmed", pricePerPerson: 12, handledBy: "manager@example.com" });

    const email = await prisma.notification.findFirstOrThrow({
      where: { dayVisitBookingId: row.id, event: "visit-confirmed" },
    });
    expect(email.body).toContain("$12 per person — $36 for 3 guests");
    expect(email.body).toContain("Bring swimwear.");

    expect(await failure(answerDayVisit({ id: row.id, status: "declined" }, "manager@example.com"))).toContain("already confirmed");
    // A confirmed visit can still be called off.
    await answerDayVisit({ id: row.id, status: "cancelled" }, "manager@example.com");
  });

  test("the staff list is scoped to the properties asked for", async () => {
    const mine = await listDayVisitBookings({ propertyIds: [propertyId] });
    expect(mine.some((row) => row.guestEmail === EMAIL)).toBe(true);
    expect(mine[0]!.propertyName.length).toBeGreaterThan(0);
    expect(await listDayVisitBookings({ propertyIds: ["no-such-property"] })).toEqual([]);
  });

  test("a visit guests have asked for is hidden, never deleted", async () => {
    expect(await failure(deleteDayVisit(visit.id))).toContain("Hide it instead");
  });
});
