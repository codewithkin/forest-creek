import { z } from "zod";

import { lodgeToday } from "./booking-policy";
import { lockRoom, occupyingBookingWhere } from "./bookings";
import { prisma } from "./client";
import { planNightlyPrices } from "./price-calendar-plan";
import { RatePeriodError } from "./rate-periods";
import { blockOverlapWhere } from "./room-blocks";
import { nightlyRates } from "./stay-pricing";

/**
 * The price calendar: every date's price for one room, and which nights are
 * taken. Staff set prices date by date in the dashboard; guests pick their
 * dates on the same calendar when booking. Rooms have no fixed price — the
 * room's own rate is only the default for dates without a price of their own.
 */

const MS_PER_NIGHT = 86_400_000;
/** At most this many days per request: a month view, with room to spare. */
const MAX_DAYS = 93;
const CALENDAR_PRICE_NAME = "Calendar price";

const night = (day: string) => new Date(day + "T00:00:00Z");
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

export const priceCalendarSchema = z
  .object({
    roomId: z.string().min(1),
    /** First day shown, YYYY-MM-DD. */
    from: z.iso.date(),
    /** The day after the last one shown, YYYY-MM-DD. */
    to: z.iso.date(),
  })
  .refine((range) => range.to > range.from, { message: "to must be after from", path: ["to"] })
  .refine((range) => (night(range.to).getTime() - night(range.from).getTime()) / MS_PER_NIGHT <= MAX_DAYS, {
    message: `At most ${MAX_DAYS} days at a time`,
    path: ["to"],
  });

export type PriceCalendarInput = z.infer<typeof priceCalendarSchema>;

export type PriceCalendarDay = {
  date: string;
  price: number;
  /** True when staff set this date's price; false means the room's default rate. */
  ownPrice: boolean;
  /** Taken by a paid stay (or one being paid right now): frozen, not bookable. */
  booked: boolean;
  /** Taken off sale by staff. */
  blocked: boolean;
  /** Before today: nothing to book or price. */
  past: boolean;
  /** Staff only: the booking holding this night. */
  reference?: string;
};

export type PriceCalendar = {
  roomId: string;
  roomName: string;
  defaultRate: number;
  days: PriceCalendarDay[];
};

/**
 * One room's calendar. `forStaff` adds the reference of the booking on each
 * taken night; guests only learn that the night is taken.
 */
export async function getRoomPriceCalendar(input: PriceCalendarInput, forStaff = false): Promise<PriceCalendar | null> {
  const { roomId, from, to } = priceCalendarSchema.parse(input);
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, name: true, pricePerNight: true } });
  if (!room) return null;

  const [periods, stays, blocks] = await Promise.all([
    prisma.roomRatePeriod.findMany({
      where: { roomId, startDate: { lt: night(to) }, endDate: { gt: night(from) } },
      select: { startDate: true, endDate: true, pricePerNight: true },
    }),
    prisma.booking.findMany({
      where: { roomId, ...occupyingBookingWhere(), checkIn: { lt: night(to) }, checkOut: { gt: night(from) } },
      select: { reference: true, checkIn: true, checkOut: true },
    }),
    prisma.roomBlock.findMany({
      where: { roomId, ...blockOverlapWhere(night(from), night(to)) },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const rates = nightlyRates(room.pricePerNight, periods, from, to);
  const today = lodgeToday();
  const days: PriceCalendarDay[] = rates.map((price, index) => {
    const time = night(from).getTime() + index * MS_PER_NIGHT;
    const covers = (range: { start: Date; end: Date }) => range.start.getTime() <= time && time < range.end.getTime();
    const stay = stays.find((candidate) => covers({ start: candidate.checkIn, end: candidate.checkOut }));
    const date = dayOf(new Date(time));
    return {
      date,
      price,
      ownPrice: periods.some((period) => covers({ start: period.startDate, end: period.endDate })),
      booked: Boolean(stay),
      blocked: blocks.some((block) => covers({ start: block.startDate, end: block.endDate })),
      past: date < today,
      ...(forStaff && stay ? { reference: stay.reference } : {}),
    };
  });
  return { roomId: room.id, roomName: room.name, defaultRate: room.pricePerNight, days };
}

export const setNightlyPricesSchema = z.object({
  roomId: z.string().min(1),
  /** The nights to price, YYYY-MM-DD. */
  dates: z.array(z.iso.date()).min(1).max(400),
  /** The new nightly price; null puts the dates back on the room's default rate. */
  price: z.number().int().positive().max(100_000).nullable(),
});

export type SetNightlyPricesInput = z.infer<typeof setNightlyPricesSchema>;

/**
 * Prices the chosen dates. Booked nights are frozen: a guest's booking keeps
 * the price it was made at anyway, and staff asked that a booked date can't be
 * repriced, so any booked night refuses the whole change (naming it). Past
 * dates are refused too. Checked under the room's lock, so a booking can't
 * land on a night between the check and the write.
 */
export async function setNightlyPrices(input: SetNightlyPricesInput, by: string): Promise<{ priced: number }> {
  const { roomId, dates, price } = setNightlyPricesSchema.parse(input);
  const nights = [...new Set(dates)].sort();
  const first = nights[0]!;
  const end = dayOf(new Date(night(nights.at(-1)!).getTime() + MS_PER_NIGHT));
  if (first < lodgeToday()) throw new RatePeriodError("Dates in the past can't be priced.");

  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId }, select: { pricePerNight: true } });
    if (!room) throw new RatePeriodError("That room does not exist");
    await lockRoom(tx, roomId);

    const stays = await tx.booking.findMany({
      where: { roomId, ...occupyingBookingWhere(), checkIn: { lt: night(end) }, checkOut: { gt: night(first) } },
      select: { reference: true, checkIn: true, checkOut: true },
    });
    for (const stay of stays) {
      const taken = nights.find((day) => night(day) >= stay.checkIn && night(day) < stay.checkOut);
      if (taken) throw new RatePeriodError(`${taken} is booked (${stay.reference}), so its price is frozen.`);
    }

    const existing = await tx.roomRatePeriod.findMany({
      where: { roomId, startDate: { lt: night(end) }, endDate: { gt: night(first) } },
    });
    // The room's own rate needs no price of its own.
    const stored = price === room.pricePerNight ? null : price;
    const plan = planNightlyPrices(existing, nights, stored, CALENDAR_PRICE_NAME, by);
    if (plan.deleteIds.length > 0) await tx.roomRatePeriod.deleteMany({ where: { id: { in: plan.deleteIds } } });
    if (plan.create.length > 0) await tx.roomRatePeriod.createMany({ data: plan.create.map((period) => ({ ...period, roomId })) });
    return { priced: nights.length };
  });
}
