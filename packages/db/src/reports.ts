import { env } from "@forest-creek/env/server";
import { z } from "zod";

import { getPropertyKpis, type PropertyKpis } from "./analytics";
import { maybeBookingWhere, securedBookingWhere, toStayDate } from "./bookings";
import { prisma } from "./client";
import { describeError } from "./log";
import { renderReportEmail } from "./notification-templates";
import {
  dueReports,
  lodgeDayStart,
  periodLabel,
  periodRange,
  previousPeriod,
  reportPeriods,
  type DayRange,
  type ReportPeriod,
} from "./report-periods";

export * from "./report-periods";

/**
 * Daily, weekly and monthly reports. Two different questions are kept apart:
 * money RECEIVED in the period (receipts, whenever the stay is) and revenue
 * EARNED by the nights in the period (stays, whenever they paid). A pay-on-
 * arrival stay is earned but not received; a deposit for next year is received
 * but not earned. Unpaid "maybe" bookings are in neither.
 */

export const reportInputSchema = z.object({
  period: z.enum(reportPeriods),
  /** Any date in the period, YYYY-MM-DD. */
  date: z.iso.date(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

const METHOD_NAMES: Record<string, string> = {
  ecocash: "EcoCash",
  onemoney: "OneMoney",
  innbucks: "InnBucks",
  visa: "Visa / Mastercard",
  paynow: "Paynow",
  bank_transfer: "Bank transfer",
  cash: "USD cash",
};

type Totals = {
  moneyReceived: number;
  refundsPaid: number;
  revenueEarned: number;
  roomNightsSold: number;
  roomNightsAvailable: number;
  occupancy: number;
  adr: number;
  revpar: number;
  bookingsMade: number;
  bookingsValue: number;
  cancellations: number;
  maybesMade: number;
  maybesValue: number;
};

async function totalsFor(range: DayRange, kpis: PropertyKpis[], propertyIds?: string[]): Promise<Totals & { byMethod: { method: string; amount: number }[] }> {
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};
  const from = lodgeDayStart(range.from);
  const to = lodgeDayStart(range.to);
  const inRange = { gte: from, lt: to };

  const [receipts, refunds, made, maybes, cancelled] = await Promise.all([
    prisma.receipt.groupBy({
      by: ["method"],
      where: { issuedAt: inRange, booking: scope },
      _sum: { amount: true },
    }),
    prisma.booking.aggregate({
      where: { ...scope, refundStatus: "refunded", refundedAt: inRange },
      _sum: { refundAmountCents: true },
    }),
    prisma.booking.aggregate({
      where: { ...scope, ...securedBookingWhere(), createdAt: inRange },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.booking.aggregate({
      where: { ...scope, ...maybeBookingWhere(), createdAt: inRange },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.bookingEvent.count({ where: { kind: "cancelled", createdAt: inRange, booking: scope } }),
  ]);

  // Group figures come from summed room-nights, never averaged across properties.
  const sum = (pick: (row: PropertyKpis) => number) => kpis.reduce((total, row) => total + pick(row), 0);
  const roomNightsSold = sum((row) => row.roomNightsSold);
  const roomNightsAvailable = sum((row) => row.roomNightsAvailable);
  const roomRevenue = sum((row) => row.roomRevenue);
  const byMethod = receipts
    .map((row) => ({ method: METHOD_NAMES[row.method] ?? row.method, amount: row._sum.amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    moneyReceived: byMethod.reduce((total, row) => total + row.amount, 0),
    refundsPaid: (refunds._sum.refundAmountCents ?? 0) / 100,
    revenueEarned: sum((row) => row.totalRevenue),
    roomNightsSold,
    roomNightsAvailable,
    occupancy: roomNightsAvailable > 0 ? roomNightsSold / roomNightsAvailable : 0,
    adr: roomNightsSold > 0 ? roomRevenue / roomNightsSold : 0,
    revpar: roomNightsAvailable > 0 ? roomRevenue / roomNightsAvailable : 0,
    bookingsMade: made._count,
    bookingsValue: made._sum.totalAmount ?? 0,
    cancellations: cancelled,
    maybesMade: maybes._count,
    maybesValue: maybes._sum.totalAmount ?? 0,
    byMethod,
  };
}

const MOVEMENT_LIMIT = 200;

export async function getReport(input: ReportInput, propertyIds?: string[]) {
  const { period, date } = reportInputSchema.parse(input);
  const range = periodRange(period, date);
  const previous = previousPeriod(period, date);
  const rows = await getPropertyKpis(range, propertyIds, previous);

  const [current, before, arrivals, departures] = await Promise.all([
    totalsFor(range, rows.map((row) => row.current), propertyIds),
    totalsFor(previous, rows.map((row) => row.previous), propertyIds),
    movements("checkIn", range, propertyIds),
    movements("checkOut", range, propertyIds),
  ]);

  return {
    period,
    date,
    label: periodLabel(period, date),
    range,
    current,
    previous: before,
    properties: rows.map(({ current: row }) => ({
      propertyId: row.propertyId,
      propertyName: row.propertyName,
      occupancy: row.occupancyRate,
      adr: row.adr,
      revpar: row.revpar,
      revenue: row.totalRevenue,
      roomNightsSold: row.roomNightsSold,
    })),
    arrivals,
    departures,
  };
}

export type Report = Awaited<ReturnType<typeof getReport>>;

function movements(field: "checkIn" | "checkOut", range: DayRange, propertyIds?: string[]) {
  return prisma.booking.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      ...securedBookingWhere(),
      [field]: { gte: toStayDate(range.from), lt: toStayDate(range.to) },
    },
    orderBy: { [field]: "asc" },
    take: MOVEMENT_LIMIT,
    select: {
      id: true,
      reference: true,
      guestName: true,
      roomName: true,
      propertyName: true,
      checkIn: true,
      checkOut: true,
      guests: true,
      totalAmount: true,
      amountPaid: true,
    },
  });
}

/* ---- Scheduled emails ---- */

export async function getReportSubscriptions(userId: string): Promise<ReportPeriod[]> {
  const rows = await prisma.reportSubscription.findMany({ where: { userId }, select: { period: true } });
  return rows.map((row) => row.period as ReportPeriod);
}

export async function setReportSubscription(userId: string, period: ReportPeriod, on: boolean): Promise<void> {
  if (on) {
    await prisma.reportSubscription.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period },
      update: {},
    });
  } else {
    await prisma.reportSubscription.deleteMany({ where: { userId, period } });
  }
}

const PERIOD_NAMES: Record<ReportPeriod, string> = { day: "Daily", week: "Weekly", month: "Monthly" };

/**
 * Queues every report due now for everyone subscribed, in the existing email
 * outbox. Safe to run as often as you like: each report has a dedupeKey, so
 * one person gets one email per period even across restarts, and one person's
 * failure doesn't stop anyone else's.
 */
export async function queueDueReports(now: Date = new Date()): Promise<number> {
  const due = dueReports(now);
  if (due.length === 0) return 0;

  const subscriptions = await prisma.reportSubscription.findMany({
    where: { period: { in: due.map((item) => item.period) }, user: { role: { in: ["admin", "manager"] } } },
    include: { user: { select: { id: true, email: true, role: true, staffProperties: { select: { propertyId: true } } } } },
  });

  let queued = 0;
  for (const subscription of subscriptions) {
    const item = due.find((candidate) => candidate.period === subscription.period)!;
    const range = periodRange(item.period, item.date);
    const dedupeKey = `report:${item.period}:${range.from}:${subscription.user.id}`;
    try {
      if (await prisma.notification.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
      const scope = subscription.user.role === "admin" ? undefined : subscription.user.staffProperties.map((link) => link.propertyId);
      const report = await getReport(item, scope);
      const url = new URL(`/dashboard/reports?period=${item.period}&date=${item.date}`, env.CORS_ORIGIN).toString();
      const email = renderReportEmail(PERIOD_NAMES[item.period], report, subscription.user.email, url);
      const { document, ...message } = email;
      const { count } = await prisma.notification.createMany({
        data: [{ ...message, content: document, event: "report", dedupeKey }],
        skipDuplicates: true,
      });
      queued += count;
    } catch (error) {
      console.error(`[reports] could not queue ${item.period} report: ${describeError(error)}`);
    }
  }
  return queued;
}
