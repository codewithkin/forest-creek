import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createDayVisit, prisma } from "@forest-creek/db";

import { t } from "../index";
import { dayVisitsRouter } from "./day-visits";

/**
 * The boundary again: anyone may ask for a day visit, only staff answer, and a
 * manager answers only for their own property.
 */
const PREFIX = "api-day-visits-test";
const createCaller = t.createCallerFactory(dayVisitsRouter);

type Role = "admin" | "manager" | "guest";
const callerAs = (id: string, role: Role) =>
  createCaller({
    session: { user: { id, role, email: `${id}@example.com` } },
  } as unknown as Parameters<typeof createCaller>[0]);
const anonymous = () =>
  createCaller({ session: null, clientIp: `${PREFIX}-${Math.random()}` } as unknown as Parameters<typeof createCaller>[0]);

const managerId = `${PREFIX}-manager`;
let visitId: string;
let propertyId: string;

async function cleanup() {
  await prisma.dayVisitBooking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
  await prisma.dayVisit.deleteMany({ where: { slug: PREFIX } });
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.property.deleteMany({ where: { slug: PREFIX } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!property) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  propertyId = property.id;
  visitId = (await createDayVisit({ propertyId, slug: PREFIX, name: "Garden day", description: "A day out." })).id;

  // A manager who runs a different house entirely.
  const other = await prisma.property.create({
    data: {
      slug: PREFIX, name: "Other House", tagline: "-", description: "-", location: "-", phone: "-",
      email: "other@example.com", heroImage: "/media/x.jpg", active: false,
    },
  });
  await prisma.user.create({
    data: { id: managerId, name: "Other Manager", email: `${managerId}@example.com`, role: "manager" },
  });
  await prisma.staffProperty.create({ data: { userId: managerId, propertyId: other.id } });
});
afterAll(cleanup);

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

// A month out: the API checks against the real today, and takes visits up to two years ahead.
const NEXT_MONTH = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

const request = () =>
  anonymous().request({
    dayVisitId: visitId,
    visitDate: NEXT_MONTH,
    guests: 2,
    guestName: "Api Visitor",
    guestEmail: `${PREFIX}@example.com`,
    guestPhone: "0771234567",
  });

describe("dayVisits", () => {
  test("anyone can see what is on offer and ask for a date", async () => {
    const offer = await anonymous().list();
    expect(offer.some((visit) => visit.id === visitId)).toBe(true);
    const view = await request();
    expect(view.reference).toMatch(/^FD-/);
    expect(await anonymous().byReference(view.reference.toLowerCase())).toMatchObject({ status: "requested" });
  });

  test("a date in the past is a plain bad request", async () => {
    expect(
      await code(
        anonymous().request({
          dayVisitId: visitId, visitDate: "2020-01-01", guests: 1,
          guestName: "Api Visitor", guestEmail: `${PREFIX}@example.com`, guestPhone: "0771234567",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  test("the requests list is staff only, and scoped to the manager's property", async () => {
    expect(await code(anonymous().bookings())).toBe("UNAUTHORIZED");
    expect(await code(callerAs("someone", "guest").bookings())).toBe("FORBIDDEN");
    const owners = await callerAs("owner", "admin").bookings();
    expect(owners.some((row) => row.guestEmail === `${PREFIX}@example.com`)).toBe(true);
    const others = await callerAs(managerId, "manager").bookings();
    expect(others.some((row) => row.guestEmail === `${PREFIX}@example.com`)).toBe(false);
  });

  test("only the property's own staff can answer, and the owner's answer sticks", async () => {
    const { reference } = await request();
    const row = await prisma.dayVisitBooking.findUniqueOrThrow({ where: { reference } });
    expect(await code(callerAs(managerId, "manager").answer({ id: row.id, status: "confirmed" }))).toBe("FORBIDDEN");
    const answered = await callerAs("owner", "admin").answer({ id: row.id, status: "confirmed", pricePerPerson: 10 });
    expect(answered).toMatchObject({ status: "confirmed", pricePerPerson: 10, handledBy: "owner@example.com" });
    expect(await code(callerAs("owner", "admin").answer({ id: row.id, status: "declined" }))).toBe("CONFLICT");
  });

  test("another property's manager cannot change what is on offer", async () => {
    expect(await code(callerAs(managerId, "manager").manage({ propertyId }))).toBe("FORBIDDEN");
    expect(await code(callerAs(managerId, "manager").setActive({ id: visitId, active: false }))).toBe("FORBIDDEN");
    expect(await code(callerAs("owner", "admin").remove({ id: visitId }))).toBe("CONFLICT");
  });
});
