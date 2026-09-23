import { z } from "zod";

import { prisma } from "./client";
import { occupyingBookingWhere, toStayDate } from "./bookings";
import { holdHasLapsed } from "./hold-policy";

const MS_PER_NIGHT = 86_400_000;

export const dateRangeSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((range) => range.to > range.from, {
    message: "to must be after from",
    path: ["to"],
  });

export type DateRange = z.infer<typeof dateRangeSchema>;

export type PropertyKpis = {
  propertyId: string;
  propertyName: string;
  activeRooms: number;
  /** Rooms x nights in the window — the denominator for occupancy and RevPAR. */
  roomNightsAvailable: number;
  roomNightsSold: number;
  occupancyRate: number;
  roomRevenue: number;
  experienceRevenue: number;
  totalRevenue: number;
  /** Average Daily Rate: what a sold room-night actually earned. */
  adr: number;
  /** Revenue per Available Room: ADR discounted by how much sat empty. */
  revpar: number;
  bookings: number;
  cancellations: number;
  cancellationRate: number;
  avgLeadTimeDays: number;
  unverifiedValue: number;
};

export type KpiComparison = {
  current: PropertyKpis;
  previous: PropertyKpis;
};

function nightsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MS_PER_NIGHT));
}

/**
 * Nights of a stay that land inside the window. A booking straddling either
 * edge only counts for the part that falls in the period, which is what keeps
 * occupancy from exceeding 100% on long stays.
 */
function overlapNights(
  checkIn: Date,
  checkOut: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const start = checkIn > rangeStart ? checkIn : rangeStart;
  const end = checkOut < rangeEnd ? checkOut : rangeEnd;
  return nightsBetween(start, end);
}

function shiftRange(range: DateRange): DateRange {
  const from = toStayDate(range.from);
  const to = toStayDate(range.to);
  const span = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - span).toISOString().slice(0, 10),
    to: range.from,
  };
}

async function computeKpis(
  propertyId: string,
  propertyName: string,
  range: DateRange,
): Promise<PropertyKpis> {
  const rangeStart = toStayDate(range.from);
  const rangeEnd = toStayDate(range.to);
  const windowNights = nightsBetween(rangeStart, rangeEnd);

  const [activeRooms, stays] = await Promise.all([
    prisma.room.count({ where: { propertyId, active: true } }),
    prisma.booking.findMany({
      where: {
        propertyId,
        checkIn: { lt: rangeEnd },
        checkOut: { gt: rangeStart },
      },
      select: {
        roomRate: true,
        checkIn: true,
        checkOut: true,
        subtotal: true,
        totalAmount: true,
        bookingStatus: true,
        paymentStatus: true,
        holdExpiresAt: true,
        createdAt: true,
      },
    }),
  ]);
  const now = new Date();

  let roomNightsSold = 0;
  let roomRevenue = 0;
  let experienceRevenue = 0;
  let cancellations = 0;
  let leadTimeTotal = 0;
  let leadTimeCount = 0;
  let unverifiedValue = 0;

  for (const stay of stays) {
    if (stay.bookingStatus === "cancelled") {
      cancellations++;
      continue;
    }
    // A hold that ran out was never a sale; it is not a cancellation either.
    if (holdHasLapsed(stay, now)) continue;

    const nights = overlapNights(stay.checkIn, stay.checkOut, rangeStart, rangeEnd);
    roomNightsSold += nights;
    roomRevenue += stay.roomRate * nights;

    // Experiences are a one-off charge, so they land in the period the guest arrives.
    if (stay.checkIn >= rangeStart && stay.checkIn < rangeEnd) {
      experienceRevenue += stay.totalAmount - stay.subtotal;
      leadTimeTotal += Math.max(
        0,
        Math.round((stay.checkIn.getTime() - stay.createdAt.getTime()) / MS_PER_NIGHT),
      );
      leadTimeCount++;
    }

    if (stay.paymentStatus === "pending") {
      unverifiedValue += stay.totalAmount;
    }
  }

  const roomNightsAvailable = activeRooms * windowNights;
  const occupancyRate = roomNightsAvailable > 0 ? roomNightsSold / roomNightsAvailable : 0;

  return {
    propertyId,
    propertyName,
    activeRooms,
    roomNightsAvailable,
    roomNightsSold,
    occupancyRate,
    roomRevenue,
    experienceRevenue,
    totalRevenue: roomRevenue + experienceRevenue,
    adr: roomNightsSold > 0 ? roomRevenue / roomNightsSold : 0,
    revpar: roomNightsAvailable > 0 ? roomRevenue / roomNightsAvailable : 0,
    bookings: stays.length - cancellations,
    cancellations,
    cancellationRate: stays.length > 0 ? cancellations / stays.length : 0,
    avgLeadTimeDays: leadTimeCount > 0 ? leadTimeTotal / leadTimeCount : 0,
    unverifiedValue,
  };
}

/** Per-property KPIs for the window, each against the preceding window of equal length. */
export async function getPropertyKpis(
  range: DateRange,
  propertyIds?: string[],
): Promise<KpiComparison[]> {
  const parsed = dateRangeSchema.parse(range);
  const previous = shiftRange(parsed);

  const properties = await prisma.property.findMany({
    where: { active: true, ...(propertyIds ? { id: { in: propertyIds } } : {}) },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return Promise.all(
    properties.map(async (property) => ({
      current: await computeKpis(property.id, property.name, parsed),
      previous: await computeKpis(property.id, property.name, previous),
    })),
  );
}

export type OpsSnapshot = {
  date: string;
  arrivals: number;
  departures: number;
  inHouse: number;
  guestsInHouse: number;
  awaitingPaymentCount: number;
  awaitingPaymentValue: number;
  bookedToday: number;
  bookedTodayValue: number;
};

/** The morning list: what needs doing at these properties today. */
export async function getOpsSnapshot(
  today: string,
  propertyIds?: string[],
): Promise<OpsSnapshot> {
  const day = toStayDate(today);
  const nextDay = new Date(day.getTime() + MS_PER_NIGHT);
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};
  const live = { ...scope, ...occupyingBookingWhere() };

  const [arrivals, departures, inHouseStays, awaiting, bookedToday] = await Promise.all([
    prisma.booking.count({ where: { ...live, checkIn: day } }),
    prisma.booking.count({ where: { ...live, checkOut: day } }),
    prisma.booking.findMany({
      where: { ...live, checkIn: { lte: day }, checkOut: { gt: day } },
      select: { guests: true },
    }),
    prisma.booking.findMany({
      where: { ...live, paymentStatus: { in: ["pending", "processing"] } },
      select: { totalAmount: true },
    }),
    prisma.booking.findMany({
      where: { ...scope, createdAt: { gte: day, lt: nextDay } },
      select: { totalAmount: true },
    }),
  ]);

  return {
    date: today,
    arrivals,
    departures,
    inHouse: inHouseStays.length,
    guestsInHouse: inHouseStays.reduce((sum, stay) => sum + stay.guests, 0),
    awaitingPaymentCount: awaiting.length,
    awaitingPaymentValue: awaiting.reduce((sum, stay) => sum + stay.totalAmount, 0),
    bookedToday: bookedToday.length,
    bookedTodayValue: bookedToday.reduce((sum, stay) => sum + stay.totalAmount, 0),
  };
}

export type RevenueDay = { date: string; roomRevenue: number; roomNightsSold: number };

/** Daily room revenue across the window, for the trend chart. */
export async function getRevenueByDay(
  range: DateRange,
  propertyIds?: string[],
): Promise<RevenueDay[]> {
  const parsed = dateRangeSchema.parse(range);
  const rangeStart = toStayDate(parsed.from);
  const rangeEnd = toStayDate(parsed.to);

  const stays = await prisma.booking.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      ...occupyingBookingWhere(),
      checkIn: { lt: rangeEnd },
      checkOut: { gt: rangeStart },
    },
    select: { roomRate: true, checkIn: true, checkOut: true },
  });

  const days: RevenueDay[] = [];
  for (let time = rangeStart.getTime(); time < rangeEnd.getTime(); time += MS_PER_NIGHT) {
    const date = new Date(time);
    let roomRevenue = 0;
    let roomNightsSold = 0;
    for (const stay of stays) {
      if (stay.checkIn <= date && stay.checkOut > date) {
        roomRevenue += stay.roomRate;
        roomNightsSold++;
      }
    }
    days.push({ date: date.toISOString().slice(0, 10), roomRevenue, roomNightsSold });
  }
  return days;
}
