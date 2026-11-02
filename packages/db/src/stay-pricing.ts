// Import-free so it can be unit tested without a database or env.

/**
 * Prices by date. A room has its own nightly rate; staff can set other prices
 * for chosen date ranges (RoomRatePeriod), so every date has a price. A stay
 * costs the ARRIVAL date's price for every night: arrive on a $120 date and
 * two nights are $240, even if the second date shows $300 (the client's rule).
 * Every quote — availability, the booking total and deposit, date changes,
 * the website and both assistants — goes through here, so they cannot differ.
 */

export type RatePeriodPrice = {
  /** UTC midnight of the first night at this price. */
  startDate: Date;
  /** UTC midnight of the first night back at the normal price (exclusive). */
  endDate: Date;
  pricePerNight: number;
  name?: string;
};

const MS_PER_NIGHT = 86_400_000;

function night(day: string): Date {
  return new Date(day + "T00:00:00Z");
}

/** The price set for one date: the period it falls in, or the room's rate. */
function rateAt(baseRate: number, periods: readonly RatePeriodPrice[], time: number): number {
  const period = periods.find((candidate) => candidate.startDate.getTime() <= time && time < candidate.endDate.getTime());
  return period ? period.pricePerNight : baseRate;
}

/** The price set for one date, YYYY-MM-DD. */
export function rateOnDate(baseRate: number, periods: readonly RatePeriodPrice[], date: string): number {
  return rateAt(baseRate, periods, night(date).getTime());
}

/**
 * The price set for each date from checkIn up to (not including) checkOut —
 * what the calendar shows and "from $X" reads. NOT what a stay across those
 * dates costs: that is priceStay.
 */
export function nightlyRates(
  baseRate: number,
  periods: readonly RatePeriodPrice[],
  checkIn: string,
  checkOut: string,
): number[] {
  const rates: number[] = [];
  for (let time = night(checkIn).getTime(); time < night(checkOut).getTime(); time += MS_PER_NIGHT) {
    rates.push(rateAt(baseRate, periods, time));
  }
  return rates;
}

export type StayPrice = {
  /** What each night of this stay costs: the arrival date's price, every night. */
  nightlyRates: number[];
  /** Accommodation for the whole stay. */
  subtotal: number;
  /** The rate this stay is charged at — what a booking keeps as roomRate. */
  averageRate: number;
};

export function priceStay(
  baseRate: number,
  periods: readonly RatePeriodPrice[],
  checkIn: string,
  checkOut: string,
): StayPrice {
  const nights = Math.max(0, Math.round((night(checkOut).getTime() - night(checkIn).getTime()) / MS_PER_NIGHT));
  const rate = rateOnDate(baseRate, periods, checkIn);
  return { nightlyRates: Array.from({ length: nights }, () => rate), subtotal: rate * nights, averageRate: rate };
}

/** Whether two date ranges share a night. */
export function periodsOverlap(a: { startDate: Date; endDate: Date }, b: { startDate: Date; endDate: Date }): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

/**
 * A booking's room revenue for the nights it spends inside [from, to). Uses
 * the nightly list the booking was made with (older bookings kept each date's
 * own price there); bookings from before prices by date have no list and
 * charged roomRate every night.
 */
export function stayRevenueBetween(
  stay: { checkIn: Date; checkOut: Date; roomRate: number; nightlyRates: number[] },
  from: Date,
  to: Date,
): number {
  const nights = Math.round((stay.checkOut.getTime() - stay.checkIn.getTime()) / MS_PER_NIGHT);
  const perNight = stay.nightlyRates.length === nights ? stay.nightlyRates : undefined;
  let revenue = 0;
  for (let index = 0; index < nights; index++) {
    const time = stay.checkIn.getTime() + index * MS_PER_NIGHT;
    if (time >= from.getTime() && time < to.getTime()) revenue += perNight ? perNight[index]! : stay.roomRate;
  }
  return revenue;
}
