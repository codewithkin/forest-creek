import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  cancelBooking,
  createRoom,
  createStaffBooking,
  getReport,
  getReportSubscriptions,
  prisma,
  queueDueReports,
  recordManualPayment,
  setReportSubscription,
} from "./index";

/**
 * Reports against hand-counted fixtures, on a throwaway property in June 2090
 * (30 nights, two rooms: 60 room-nights available).
 */
const SLUG = "reports-test";
const USER_EMAIL = "reports-test-user@example.com";
const MANAGER_EMAIL = "reports-test-manager@example.com";
const BY = "manager@example.com";
let propertyId: string;
let roomId: string;
let otherRoomId: string;
let userId: string;

async function cleanup() {
  const bookings = await prisma.booking.findMany({ where: { property: { slug: SLUG } }, select: { id: true } });
  await prisma.paymentEvent.deleteMany({ where: { bookingId: { in: bookings.map((booking) => booking.id) } } });
  await prisma.notification.deleteMany({ where: { recipient: { in: [USER_EMAIL, MANAGER_EMAIL] } } });
  await prisma.user.deleteMany({ where: { email: { in: [USER_EMAIL, MANAGER_EMAIL] } } });
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

const staff = (room: string, checkIn: string, checkOut: string, payment: Parameters<typeof createStaffBooking>[0]["payment"]) =>
  createStaffBooking({ roomId: room, checkIn, checkOut, guests: 2, guestName: "Report Guest", source: "phone", payment }, BY);

/** Moves a receipt to a chosen moment, as if the money came in then. */
const paidAt = (bookingId: string, moment: string) =>
  prisma.receipt.updateMany({ where: { bookingId }, data: { issuedAt: new Date(moment) } });

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: { slug: SLUG, name: "Report House", tagline: "-", description: "-", location: "-", phone: "-", email: "report-house@example.com", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  propertyId = property.id;
  const room = (name: string) => createRoom({ propertyId, name, description: "-", pricePerNight: 100, capacity: 4, bedType: "-", images: ["/media/x.jpg"] });
  roomId = (await room("Suite")).id;
  otherRoomId = (await room("Cottage")).id;

  // A: 3 nights inside June, paid in full ($300) during June.
  const a = await staff(roomId, "2090-06-10", "2090-06-13", { kind: "record", amount: 300, method: "cash", note: "A" });
  await paidAt(a.id, "2090-06-05T10:00:00Z");
  // B: 28 May to 3 June: 5 nights, only 2 of them in June. Deposit paid in May.
  const b = await staff(roomId, "2090-05-29", "2090-06-03", { kind: "record", amount: 250, method: "bank_transfer", note: "B" });
  await paidAt(b.id, "2090-05-20T10:00:00Z");
  // C: pays on arrival in June: earned, but no money received.
  await staff(otherRoomId, "2090-06-20", "2090-06-22", { kind: "arrival" });
  // D: an August stay whose deposit landed in June: received, not earned in June.
  const d = await staff(roomId, "2090-08-01", "2090-08-03", { kind: "record", amount: 100, method: "cash", note: "D" });
  await paidAt(d.id, "2090-06-30T21:59:00Z");
  // E: unpaid in June: a maybe, neither earned nor received.
  await staff(otherRoomId, "2090-06-25", "2090-06-27", { kind: "none" });
  // F: paid just after June ends in Zimbabwe (July 1st, 00:01 there).
  const f = await staff(roomId, "2090-09-01", "2090-09-02", { kind: "record", amount: 100, method: "cash", note: "F" });
  await paidAt(f.id, "2090-06-30T22:01:00Z");

  const user = await prisma.user.create({
    data: { id: "reports-test-user", name: "Report Reader", email: USER_EMAIL, emailVerified: true, role: "admin" },
  });
  userId = user.id;
});
afterAll(cleanup);

describe("a monthly report", () => {
  test("keeps money received apart from revenue earned", async () => {
    const report = await getReport({ period: "month", date: "2090-06-15" }, [propertyId]);
    expect(report.label).toBe("June 2090");
    // A 300 + D 100. Not B (May), not F (a minute into July in Zimbabwe), nothing from C.
    expect(report.current.moneyReceived).toBe(400);
    expect(report.current.byMethod).toEqual([{ method: "USD cash", amount: 400 }]);
    // A 3 nights + B 2 nights + C 2 nights at $100. E and D earn nothing in June.
    expect(report.current.revenueEarned).toBe(700);
    expect(report.current.roomNightsSold).toBe(7);
    expect(report.current.roomNightsAvailable).toBe(60);
  });

  test("occupancy and rates agree with each other", async () => {
    const { current } = await getReport({ period: "month", date: "2090-06-15" }, [propertyId]);
    expect(current.occupancy).toBeCloseTo(7 / 60, 6);
    expect(current.adr).toBe(100);
    expect(current.revpar).toBeCloseTo(current.adr * current.occupancy, 6);
  });

  test("compares with the real month before", async () => {
    const report = await getReport({ period: "month", date: "2090-06-15" }, [propertyId]);
    expect(report.previous.moneyReceived).toBe(250);
    // B's 3 May nights, 29th to 31st.
    expect(report.previous.revenueEarned).toBe(300);
  });

  test("lists arrivals and departures of paid stays only", async () => {
    const report = await getReport({ period: "month", date: "2090-06-15" }, [propertyId]);
    expect(report.arrivals.map((stay) => stay.checkIn.toISOString().slice(0, 10))).toEqual(["2090-06-10", "2090-06-20"]);
    expect(report.departures.map((stay) => stay.checkOut.toISOString().slice(0, 10))).toEqual(["2090-06-03", "2090-06-13", "2090-06-22"]);
  });

  test("counts someone else's property as nothing", async () => {
    const report = await getReport({ period: "month", date: "2090-06-15" }, ["no-such-property"]);
    expect(report.current.moneyReceived).toBe(0);
    expect(report.properties).toEqual([]);
  });
});

describe("a shorter report", () => {
  test("a day holds what happened that day in Zimbabwe", async () => {
    // F was paid at 00:01 on 1 July, Zimbabwe time.
    const day = await getReport({ period: "day", date: "2090-07-01" }, [propertyId]);
    expect(day.current.moneyReceived).toBe(100);
    expect((await getReport({ period: "day", date: "2090-06-30" }, [propertyId])).current.moneyReceived).toBe(100);
  });

  test("a week is Monday to Sunday and takes each night that falls in it", async () => {
    // 12 to 18 June 2090 holds only the last of A's three nights.
    const week = await getReport({ period: "week", date: "2090-06-13" }, [propertyId]);
    expect(week.range).toEqual({ from: "2090-06-12", to: "2090-06-19" });
    expect(week.current.roomNightsSold).toBe(1);
  });
});

describe("cancellations and refunds", () => {
  test("a cancellation lands in the period it happened, and a paid refund with it", async () => {
    const stay = await staff(otherRoomId, "2090-10-10", "2090-10-12", { kind: "arrival" });
    await cancelBooking(stay.id, BY, "Guest phoned");
    const today = new Date().toISOString().slice(0, 10);
    expect((await getReport({ period: "month", date: today }, [propertyId])).current.cancellations).toBe(1);

    const refunded = await staff(roomId, "2090-11-10", "2090-11-12", { kind: "none" });
    await recordManualPayment({ id: refunded.id, amount: 200, method: "cash", note: "R" }, BY);
    await prisma.booking.update({
      where: { id: refunded.id },
      data: { refundStatus: "refunded", refundedAt: new Date("2090-12-15T10:00:00Z"), refundAmountCents: 15000 },
    });
    expect((await getReport({ period: "month", date: "2090-12-15" }, [propertyId])).current.refundsPaid).toBe(150);
  });
});

describe("emailed reports", () => {
  const monday7am = new Date("2090-07-03T05:30:00Z");

  test("nobody is mailed until they ask", async () => {
    await queueDueReports(monday7am);
    expect(await prisma.notification.count({ where: { recipient: USER_EMAIL } })).toBe(0);
  });

  test("a subscriber gets each report once, however often it runs", async () => {
    await setReportSubscription(userId, "day", true);
    await setReportSubscription(userId, "week", true);
    await setReportSubscription(userId, "month", false);
    expect((await getReportSubscriptions(userId)).sort()).toEqual(["day", "week"]);

    expect(await queueDueReports(monday7am)).toBe(2);
    expect(await queueDueReports(monday7am)).toBe(0);
    const emails = await prisma.notification.findMany({ where: { recipient: USER_EMAIL }, orderBy: { subject: "asc" } });
    expect(emails.map((email) => email.subject)).toEqual(["Daily report: Sunday, 2 July 2090", "Weekly report: 26 Jun – 2 Jul 2090"]);
    expect(emails[0]?.body).toContain("/dashboard/reports?period=day&date=2090-07-02");
  });

  test("a manager's email covers only their properties", async () => {
    const manager = await prisma.user.create({
      data: { id: "reports-test-manager", name: "M", email: MANAGER_EMAIL, emailVerified: true, role: "manager" },
    });
    await setReportSubscription(manager.id, "day", true);
    await queueDueReports(new Date("2090-07-02T06:00:00Z"));
    const email = await prisma.notification.findFirst({ where: { recipient: MANAGER_EMAIL } });
    // No StaffProperty links, so no money at all, whatever the group took.
    expect(email?.body).toContain("Money received");
    expect(email?.body).toContain("$0");
  });
});
