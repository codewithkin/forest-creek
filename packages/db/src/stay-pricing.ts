// Import-free so it can be unit tested without a database or env.

/**
 * Prices by date. A room has its own nightly rate; staff can set other prices
 * for chosen date ranges (RoomRatePeriod). A stay is priced night by night:
 * each night costs the price of the period it falls in, or the room's rate.
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

/** The price of each night from checkIn up to (not including) checkOut. */
export function nightlyRates(
  baseRate: number,
  periods: readonly RatePeriodPrice[],
  checkIn: string,
  checkOut: string,
): number[] {
  const rates: number[] = [];
  for (let time = night(checkIn).getTime(); time < night(checkOut).getTime(); time += MS_PER_NIGHT) {
    const period = periods.find((candidate) => candidate.startDate.getTime() <= time && time < candidate.endDate.getTime());
    rates.push(period ? period.pricePerNight : baseRate);
  }
  return rates;
}

export type StayPrice = {
  nightlyRates: number[];
  /** Accommodation for the whole stay. */
  subtotal: number;
  /** subtotal / nights, rounded — what a booking keeps as roomRate. */
  averageRate: number;
  /** True when not every night costs the same. */
  varies: boolean;
};

export function priceStay(
  baseRate: number,
  periods: readonly RatePeriodPrice[],
  checkIn: string,
  checkOut: string,
): StayPrice {
  const rates = nightlyRates(baseRate, periods, checkIn, checkOut);
  const subtotal = rates.reduce((sum, rate) => sum + rate, 0);
  return {
    nightlyRates: rates,
    subtotal,
    averageRate: rates.length === 0 ? baseRate : Math.round(subtotal / rates.length),
    varies: rates.some((rate) => rate !== rates[0]),
  };
}

/** Whether two date ranges share a night. */
export function periodsOverlap(a: { startDate: Date; endDate: Date }, b: { startDate: Date; endDate: Date }): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

/**
 * A booking's room revenue for the nights it spends inside [from, to). Uses
 * the price it was booked at for each night; bookings from before prices by
 * date have no nightly list and charged roomRate every night.
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
