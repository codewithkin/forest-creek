// Import-free apart from the pricing rule, so it is unit tested without a database.
import { stayRevenueBetween } from "./stay-pricing";

/*
 * The arithmetic behind Trends & Analytics. Everything is a pure function of
 * the stays it is given, so the figures can be checked by hand. Only secured
 * stays earn; the definitions match packages/db/src/analytics.ts:
 * occupancy = nights sold / nights available, ADR = room revenue / nights sold,
 * RevPAR = room revenue / nights available, so RevPAR == ADR × occupancy.
 */

export type TrendStay = {
  propertyId: string;
  propertyName: string;
  roomId: string | null;
  roomName: string;
  checkIn: Date;
  checkOut: Date;
  roomRate: number;
  nightlyRates: number[];
  subtotal: number;
  totalAmount: number;
  channel: string;
  activityNames: string[];
  createdAt: Date;
};

export type RoomCount = { propertyId: string; propertyName: string; activeRooms: number };

const DAY = 86_400_000;
const nightsIn = (stay: { checkIn: Date; checkOut: Date }, from: Date, to: Date) => {
  const start = Math.max(stay.checkIn.getTime(), from.getTime());
  const end = Math.min(stay.checkOut.getTime(), to.getTime());
  return Math.max(0, Math.round((end - start) / DAY));
};
const daysBetween = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));

export type Performance = {
  nightsSold: number;
  nightsAvailable: number;
  roomRevenue: number;
  occupancy: number;
  adr: number;
  revpar: number;
};

/** Sold nights and room revenue across a window, for a given number of rooms. */
export function performance(stays: readonly TrendStay[], from: Date, to: Date, rooms: number): Performance {
  const nightsSold = stays.reduce((sum, stay) => sum + nightsIn(stay, from, to), 0);
  const roomRevenue = stays.reduce((sum, stay) => sum + stayRevenueBetween(stay, from, to), 0);
  const nightsAvailable = rooms * daysBetween(from, to);
  return {
    nightsSold,
    nightsAvailable,
    roomRevenue,
    occupancy: nightsAvailable > 0 ? nightsSold / nightsAvailable : 0,
    adr: nightsSold > 0 ? roomRevenue / nightsSold : 0,
    revpar: nightsAvailable > 0 ? roomRevenue / nightsAvailable : 0,
  };
}

/** The first of each month from `from` up to `to`, as [start, end) pairs clipped to the window. */
export function monthsBetween(from: Date, to: Date): { month: string; start: Date; end: Date }[] {
  const months: { month: string; start: Date; end: Date }[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor < to) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    months.push({
      month: cursor.toISOString().slice(0, 7),
      start: cursor < from ? from : cursor,
      end: next > to ? to : next,
    });
    cursor = next;
  }
  return months;
}

export function monthlySeries(stays: readonly TrendStay[], from: Date, to: Date, rooms: number) {
  return monthsBetween(from, to).map(({ month, start, end }) => ({ month, ...performance(stays, start, end, rooms) }));
}

export type Ranked = Performance & { key: string; name: string; share: number };

/** Each property's performance, best revenue first. Share is of the group's room revenue. */
export function rankByProperty(stays: readonly TrendStay[], counts: readonly RoomCount[], from: Date, to: Date): Ranked[] {
  const rows = counts.map((count) => ({
    key: count.propertyId,
    name: count.propertyName,
    ...performance(stays.filter((stay) => stay.propertyId === count.propertyId), from, to, count.activeRooms),
  }));
  const total = rows.reduce((sum, row) => sum + row.roomRevenue, 0);
  return rows.map((row) => ({ ...row, share: total > 0 ? row.roomRevenue / total : 0 })).sort((a, b) => b.roomRevenue - a.roomRevenue);
}

/** Rooms by revenue. Each room is one room, so occupancy is against its own nights. */
export function rankByRoom(stays: readonly TrendStay[], from: Date, to: Date, limit = 8): Ranked[] {
  const groups = new Map<string, { name: string; stays: TrendStay[] }>();
  for (const stay of stays) {
    const key = stay.roomId ?? `${stay.propertyId}:${stay.roomName}`;
    const group = groups.get(key) ?? { name: `${stay.roomName}, ${stay.propertyName}`, stays: [] };
    group.stays.push(stay);
    groups.set(key, group);
  }
  const rows = [...groups].map(([key, group]) => ({ key, name: group.name, ...performance(group.stays, from, to, 1) }));
  const total = rows.reduce((sum, row) => sum + row.roomRevenue, 0);
  return rows
    .map((row) => ({ ...row, share: total > 0 ? row.roomRevenue / total : 0 }))
    .filter((row) => row.nightsSold > 0)
    .sort((a, b) => b.roomRevenue - a.roomRevenue)
    .slice(0, limit);
}

/** Bookings and their value by where they came from, arrivals in the window. */
export function channelMix(stays: readonly TrendStay[]) {
  const totals = new Map<string, { channel: string; bookings: number; value: number }>();
  for (const stay of stays) {
    const row = totals.get(stay.channel) ?? { channel: stay.channel, bookings: 0, value: 0 };
    row.bookings++;
    row.value += stay.totalAmount;
    totals.set(stay.channel, row);
  }
  return [...totals.values()].sort((a, b) => b.value - a.value);
}

const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

/** How far ahead guests book, and how long they stay. */
export function bookingHabits(stays: readonly TrendStay[]) {
  return {
    leadDays: average(stays.map((stay) => Math.max(0, Math.round((stay.checkIn.getTime() - stay.createdAt.getTime()) / DAY)))),
    stayNights: average(stays.map((stay) => daysBetween(stay.checkIn, stay.checkOut))),
  };
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Nights sold on each weekday inside the window, Monday first. */
export function weekdayDemand(stays: readonly TrendStay[], from: Date, to: Date): { day: string; nights: number }[] {
  const nights = WEEKDAYS.map(() => 0);
  for (const stay of stays) {
    const start = Math.max(stay.checkIn.getTime(), from.getTime());
    const end = Math.min(stay.checkOut.getTime(), to.getTime());
    for (let time = start; time < end; time += DAY) {
      nights[(new Date(time).getUTCDay() + 6) % 7]!++;
    }
  }
  return WEEKDAYS.map((day, index) => ({ day, nights: nights[index]! }));
}

/** Experiences by how many stays took them. */
export function topExperiences(stays: readonly TrendStay[], limit = 6) {
  const counts = new Map<string, number>();
  for (const stay of stays) for (const name of stay.activityNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export type InsightFacts = {
  /** Enough stays to say anything at all. */
  stays: number;
  properties: Ranked[];
  previousProperties: Ranked[];
  months: { month: string; roomRevenue: number; occupancy: number }[];
  bestWeekday?: string;
  quietestWeekday?: string;
  channels: { channel: string; bookings: number; value: number }[];
  leadDays: number;
  conversion: number | null;
  cancellationRate: number | null;
  forward30: { occupancy: number };
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const CHANNEL_NAMES: Record<string, string> = { web: "the website", whatsapp: "WhatsApp", staff: "staff", quote: "quotations" };

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long" });
}

/** Too few stays to mean anything: a plain "not enough yet" is better than a false trend. */
export const MIN_STAYS_FOR_INSIGHTS = 5;

/**
 * Plain sentences from the figures, for an owner deciding what to do. No model
 * writes these: every number comes from the data, so nothing can be invented.
 */
export function buildInsights(facts: InsightFacts): string[] {
  if (facts.stays < MIN_STAYS_FOR_INSIGHTS) return [];
  const lines: string[] = [];

  const [best] = facts.properties;
  if (best && best.roomRevenue > 0 && facts.properties.length > 1) {
    const before = facts.previousProperties.find((row) => row.key === best.key);
    const change = before && before.roomRevenue > 0 ? (best.roomRevenue - before.roomRevenue) / before.roomRevenue : undefined;
    lines.push(
      `${best.name} is the best performer, earning ${percent(best.share)} of room revenue` +
        (change !== undefined && Math.abs(change) >= 0.01 ? `, ${change > 0 ? "up" : "down"} ${percent(Math.abs(change))} on the period before.` : "."),
    );
    const fullest = [...facts.properties].sort((a, b) => b.occupancy - a.occupancy)[0]!;
    if (fullest.key !== best.key) lines.push(`${fullest.name} is the fullest, at ${percent(fullest.occupancy)} occupancy, while ${best.name} earns more per night.`);
  }

  const earned = facts.months.filter((month) => month.roomRevenue > 0);
  if (earned.length >= 3) {
    const top = earned.reduce((a, b) => (b.roomRevenue > a.roomRevenue ? b : a));
    const low = earned.reduce((a, b) => (b.roomRevenue < a.roomRevenue ? b : a));
    lines.push(`${monthName(top.month)} was the strongest month and ${monthName(low.month)} the quietest. The quiet months are where a special price could help.`);
  }

  if (facts.bestWeekday && facts.quietestWeekday && facts.bestWeekday !== facts.quietestWeekday) {
    lines.push(`${facts.bestWeekday} nights sell best and ${facts.quietestWeekday} nights least.`);
  }

  const [channel] = facts.channels;
  const totalBookings = facts.channels.reduce((sum, row) => sum + row.bookings, 0);
  if (channel && totalBookings > 0) {
    lines.push(`Most booking value comes through ${CHANNEL_NAMES[channel.channel] ?? channel.channel} (${channel.bookings} of ${totalBookings} bookings).`);
  }

  if (facts.leadDays >= 1) lines.push(`Guests book about ${Math.round(facts.leadDays)} days ahead on average, so offers need that much notice to work.`);
  if (facts.conversion !== null && facts.conversion < 0.5) {
    lines.push(`Only ${percent(facts.conversion)} of bookings end up confirmed. Following up unpaid bookings could lift income.`);
  }
  if (facts.cancellationRate !== null && facts.cancellationRate >= 0.15) {
    lines.push(`${percent(facts.cancellationRate)} of bookings are cancelled, which is worth a look.`);
  }
  if (facts.forward30.occupancy < 0.2) lines.push(`The next 30 days are ${percent(facts.forward30.occupancy)} booked, so there is room to promote them.`);
  return lines;
}
