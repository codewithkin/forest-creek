import { z } from "zod";

import { addDays, lodgeToday } from "./booking-policy";
import { securedBookingWhere, toStayDate } from "./bookings";
import { prisma } from "./client";
import {
  bookingHabits,
  buildInsights,
  channelMix,
  monthlySeries,
  performance,
  rankByProperty,
  rankByRoom,
  topExperiences,
  weekdayDemand,
  type RoomCount,
  type TrendStay,
} from "./trend-math";

export * from "./trend-math";

/** How far back a trend can look. */
export const trendsInputSchema = z.object({ months: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).default(12) });

const STAY_FIELDS = {
  propertyId: true,
  propertyName: true,
  roomId: true,
  roomName: true,
  checkIn: true,
  checkOut: true,
  roomRate: true,
  nightlyRates: true,
  subtotal: true,
  totalAmount: true,
  channel: true,
  activityNames: true,
  createdAt: true,
} as const;

function monthsAgo(from: Date, months: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, 1));
}

/**
 * The business over time, from secured stays only: what actually sold. A window
 * runs from the first of the month, N months back, up to tomorrow, so the
 * current month counts the nights that have happened and not the ones to come.
 */
export async function getTrends(input: z.input<typeof trendsInputSchema>, propertyIds?: string[]) {
  const { months } = trendsInputSchema.parse(input);
  const today = lodgeToday();
  const to = toStayDate(addDays(today, 1));
  const from = monthsAgo(toStayDate(today), months - 1);
  const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const forwardEnd = toStayDate(addDays(today, 90));
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};

  const [properties, stays, madeInWindow, cancelledInWindow, securedInWindow] = await Promise.all([
    prisma.property.findMany({
      where: { active: true, ...(propertyIds ? { id: { in: propertyIds } } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { rooms: { where: { active: true } } } } },
    }),
    prisma.booking.findMany({
      where: { ...scope, ...securedBookingWhere(), checkIn: { lt: forwardEnd }, checkOut: { gt: previousFrom } },
      select: STAY_FIELDS,
    }) as Promise<TrendStay[]>,
    prisma.booking.count({ where: { ...scope, createdAt: { gte: from, lt: to } } }),
    prisma.booking.count({ where: { ...scope, createdAt: { gte: from, lt: to }, bookingStatus: "cancelled" } }),
    // Secured, or paid before being cancelled: either way the guest committed.
    // Pay-on-arrival stays count: they are confirmed, with no money in yet.
    prisma.booking.count({
      where: {
        ...scope,
        createdAt: { gte: from, lt: to },
        OR: [{ amountPaid: { gt: 0 } }, { bookingStatus: "confirmed" }],
      },
    }),
  ]);

  const counts: RoomCount[] = properties.map((property) => ({
    propertyId: property.id,
    propertyName: property.name,
    activeRooms: property._count.rooms,
  }));
  const rooms = counts.reduce((sum, count) => sum + count.activeRooms, 0);

  const arrivals = stays.filter((stay) => stay.checkIn >= from && stay.checkIn < to);
  const propertyRanks = rankByProperty(stays, counts, from, to);
  const previousRanks = rankByProperty(stays, counts, previousFrom, from);
  const monthly = monthlySeries(stays, from, to, rooms);
  const weekdays = weekdayDemand(stays, from, to);
  const channels = channelMix(arrivals);
  const habits = bookingHabits(arrivals);
  const sold = [...weekdays].sort((a, b) => b.nights - a.nights);

  const forward = (days: number) => {
    const start = toStayDate(today);
    return { days, ...performance(stays, start, toStayDate(addDays(today, days)), rooms) };
  };
  const forwards = [forward(30), forward(60), forward(90)];

  const conversion = madeInWindow > 0 ? securedInWindow / madeInWindow : null;
  const cancellationRate = madeInWindow > 0 ? cancelledInWindow / madeInWindow : null;

  const current = performance(stays, from, to, rooms);
  const previous = performance(stays, previousFrom, from, rooms);

  return {
    months,
    from: from.toISOString().slice(0, 10),
    current,
    previous,
    monthly,
    properties: propertyRanks,
    rooms: rankByRoom(stays, from, to),
    channels,
    weekdays,
    experiences: topExperiences(arrivals),
    habits,
    conversion,
    cancellationRate,
    forwards,
    staysCounted: arrivals.length,
    insights: buildInsights({
      stays: arrivals.length,
      properties: propertyRanks,
      previousProperties: previousRanks,
      months: monthly,
      bestWeekday: sold[0]?.nights ? sold[0].day : undefined,
      quietestWeekday: sold[0]?.nights ? sold[sold.length - 1]?.day : undefined,
      channels,
      leadDays: habits.leadDays,
      conversion,
      cancellationRate,
      forward30: forwards[0]!,
    }),
  };
}
