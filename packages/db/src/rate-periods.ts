import { z } from "zod";

import { addDays, lodgeToday } from "./booking-policy";
import { prisma } from "./client";
import { nightlyRates, periodsOverlap, priceStay, type RatePeriodPrice, type StayPrice } from "./stay-pricing";

import type { Room } from "../prisma/generated/client";

/**
 * Prices by date (see stay-pricing.ts for the rule). Staff give the first and
 * the last night at the special price — how people say a date range; it is
 * stored like a stay, with an exclusive end, so the overlap rules are shared.
 */

const toNight = (day: string) => new Date(day + "T00:00:00Z");
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export const createRatePeriodSchema = z
  .object({
    /** One period per room; staff can price several rooms at once. */
    roomIds: z.array(z.string().min(1)).min(1).max(50),
    name: z.string().trim().min(1).max(80),
    /** First night at this price, YYYY-MM-DD. */
    from: z.iso.date(),
    /** Last night at this price, YYYY-MM-DD (inclusive). */
    lastNight: z.iso.date(),
    pricePerNight: z.number().int().positive().max(100_000),
  })
  .refine((period) => period.lastNight >= period.from, {
    message: "The last night must be on or after the first",
    path: ["lastNight"],
  });

export type CreateRatePeriodInput = z.infer<typeof createRatePeriodSchema>;

export class RatePeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RatePeriodError";
  }
}

export type RatePeriodView = {
  id: string;
  roomId: string;
  roomName: string;
  name: string;
  /** YYYY-MM-DD, first night at this price. */
  from: string;
  /** YYYY-MM-DD, last night at this price. */
  lastNight: string;
  pricePerNight: number;
  /** The room's own nightly rate, for comparison. */
  normalRate: number;
  createdBy: string;
};

/**
 * Sets a price for chosen dates on each room given. Refused, naming the clash,
 * when a room already has a price for any of those nights — staff remove the
 * old one first, so a guest's price is never ambiguous.
 */
export async function createRatePeriods(input: CreateRatePeriodInput, by: string): Promise<{ created: number }> {
  const data = createRatePeriodSchema.parse(input);
  const startDate = toNight(data.from);
  const endDate = toNight(addDays(data.lastNight, 1));

  return prisma.$transaction(async (tx) => {
    const rooms = await tx.room.findMany({ where: { id: { in: data.roomIds } }, select: { id: true, name: true } });
    if (rooms.length !== new Set(data.roomIds).size) throw new RatePeriodError("One of those rooms does not exist");

    const existing = await tx.roomRatePeriod.findMany({
      where: { roomId: { in: data.roomIds }, startDate: { lt: endDate }, endDate: { gt: startDate } },
      include: { room: { select: { name: true } } },
    });
    const clash = existing.find((period) => periodsOverlap(period, { startDate, endDate }));
    if (clash) {
      throw new RatePeriodError(
        `${clash.room.name} already has "${clash.name}" (${toDay(clash.startDate)} to ${toDay(addDaysToDate(clash.endDate, -1))}) on some of those nights. Remove it first.`,
      );
    }

    await tx.roomRatePeriod.createMany({
      data: rooms.map((room) => ({
        roomId: room.id,
        name: data.name,
        startDate,
        endDate,
        pricePerNight: data.pricePerNight,
        createdBy: by,
      })),
    });
    return { created: rooms.length };
  });
}

function addDaysToDate(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** A property's prices by date that are current or still to come, soonest first. */
export async function listRatePeriods(propertyId: string, today: string = lodgeToday()): Promise<RatePeriodView[]> {
  const periods = await prisma.roomRatePeriod.findMany({
    where: { room: { propertyId }, endDate: { gt: toNight(today) } },
    include: { room: { select: { name: true, pricePerNight: true } } },
    orderBy: [{ startDate: "asc" }, { room: { sortOrder: "asc" } }],
  });
  return periods.map((period) => ({
    id: period.id,
    roomId: period.roomId,
    roomName: period.room.name,
    name: period.name,
    from: toDay(period.startDate),
    lastNight: toDay(addDaysToDate(period.endDate, -1)),
    pricePerNight: period.pricePerNight,
    normalRate: period.room.pricePerNight,
    createdBy: period.createdBy,
  }));
}

export function getRatePeriodById(id: string) {
  return prisma.roomRatePeriod.findUnique({ where: { id }, include: { room: { select: { propertyId: true } } } });
}

/** Removes a price. Bookings already made keep the price they were made at. */
export async function deleteRatePeriod(id: string): Promise<{ id: string }> {
  await prisma.roomRatePeriod.delete({ where: { id } });
  return { id };
}

/** The periods touching [checkIn, checkOut) for the given rooms, grouped by room. */
async function periodsByRoom(roomIds: string[], checkIn: string, checkOut: string) {
  const periods = await prisma.roomRatePeriod.findMany({
    where: { roomId: { in: roomIds }, startDate: { lt: toNight(checkOut) }, endDate: { gt: toNight(checkIn) } },
    select: { roomId: true, startDate: true, endDate: true, pricePerNight: true, name: true },
  });
  const byRoom = new Map<string, RatePeriodPrice[]>();
  for (const period of periods) byRoom.set(period.roomId, [...(byRoom.get(period.roomId) ?? []), period]);
  return byRoom;
}

/** What each room costs for a stay, night by night. */
export async function quoteRooms(
  rooms: Pick<Room, "id" | "pricePerNight">[],
  checkIn: string,
  checkOut: string,
): Promise<Map<string, StayPrice>> {
  const byRoom = await periodsByRoom(rooms.map((room) => room.id), checkIn, checkOut);
  return new Map(rooms.map((room) => [room.id, priceStay(room.pricePerNight, byRoom.get(room.id) ?? [], checkIn, checkOut)]));
}

export async function quoteRoom(room: Pick<Room, "id" | "pricePerNight">, checkIn: string, checkOut: string): Promise<StayPrice> {
  return (await quoteRooms([room], checkIn, checkOut)).get(room.id)!;
}

/**
 * Every nightly price a guest could be quoted — rooms' own rates plus every
 * current or future period — so the assistants' guard against invented rates
 * knows a seasonal price is real.
 */
export async function allQuotableNightlyRates(today: string = lodgeToday()): Promise<number[]> {
  const [rooms, periods] = await Promise.all([
    prisma.room.findMany({ select: { pricePerNight: true } }),
    prisma.roomRatePeriod.findMany({ where: { endDate: { gt: toNight(today) } }, select: { pricePerNight: true } }),
  ]);
  return [...new Set([...rooms, ...periods].map((item) => item.pricePerNight))];
}

/** How far ahead "from $X" looks for a room's lowest nightly price. */
export const FROM_PRICE_DAYS = 365;

/**
 * Each room's lowest nightly price over the coming year — what "from $X"
 * shows. Rooms have no fixed price: the room's own rate only applies to
 * nights without a price of their own, so a room priced higher on every
 * coming night is never advertised at its old base rate.
 */
export async function fromPrices(
  rooms: Pick<Room, "id" | "pricePerNight">[],
  today: string = lodgeToday(),
): Promise<Map<string, number>> {
  const until = addDays(today, FROM_PRICE_DAYS);
  const byRoom = await periodsByRoom(rooms.map((room) => room.id), today, until);
  return new Map(
    rooms.map((room) => [room.id, Math.min(...nightlyRates(room.pricePerNight, byRoom.get(room.id) ?? [], today, until))]),
  );
}

/** Rooms for the website, each with its "from" price. */
export async function getRoomsWithFromPrice(propertyId?: string) {
  const rooms = await prisma.room.findMany({
    where: { propertyId, active: true },
    orderBy: [{ sortOrder: "asc" }, { pricePerNight: "desc" }],
  });
  const from = await fromPrices(rooms);
  return rooms.map((room) => ({ ...room, fromPrice: from.get(room.id) ?? room.pricePerNight }));
}
