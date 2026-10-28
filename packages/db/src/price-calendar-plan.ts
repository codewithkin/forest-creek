// Import-free so it can be unit tested without a database or env.

/**
 * Setting prices on individual dates of the price calendar. Prices are stored
 * as RoomRatePeriods (UTC-midnight start, exclusive end, never overlapping for
 * one room), so pricing a few nights inside a longer period cuts that period
 * around them: the nights before and after keep their old price.
 */

const MS_PER_NIGHT = 86_400_000;

export type StoredPeriod = {
  id: string;
  startDate: Date;
  endDate: Date;
  pricePerNight: number;
  name: string;
  createdBy: string;
};

export type NewPeriod = Omit<StoredPeriod, "id">;

export type PricePlan = { deleteIds: string[]; create: NewPeriod[] };

const night = (day: string) => new Date(day + "T00:00:00Z");
const key = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Consecutive nights grouped into [start, end) runs. Input: YYYY-MM-DD, any order. */
export function nightRuns(nights: readonly string[]): Array<{ startDate: Date; endDate: Date }> {
  const times = [...new Set(nights)].map((day) => night(day).getTime()).sort((a, b) => a - b);
  const runs: Array<{ startDate: Date; endDate: Date }> = [];
  for (const time of times) {
    const last = runs.at(-1);
    if (last && last.endDate.getTime() === time) last.endDate = new Date(time + MS_PER_NIGHT);
    else runs.push({ startDate: new Date(time), endDate: new Date(time + MS_PER_NIGHT) });
  }
  return runs;
}

/**
 * What to write so the given nights cost `price` (or go back to the room's own
 * rate when `price` is null), leaving every other night exactly as it was.
 */
export function planNightlyPrices(
  existing: readonly StoredPeriod[],
  nights: readonly string[],
  price: number | null,
  name: string,
  by: string,
): PricePlan {
  const chosen = new Set(nights);
  const deleteIds: string[] = [];
  const create: NewPeriod[] = [];

  for (const period of existing) {
    const kept: string[] = [];
    let touched = false;
    for (let time = period.startDate.getTime(); time < period.endDate.getTime(); time += MS_PER_NIGHT) {
      if (chosen.has(key(time))) touched = true;
      else kept.push(key(time));
    }
    if (!touched) continue;
    deleteIds.push(period.id);
    for (const run of nightRuns(kept)) {
      create.push({ ...run, pricePerNight: period.pricePerNight, name: period.name, createdBy: period.createdBy });
    }
  }

  if (price !== null) {
    for (const run of nightRuns(nights)) create.push({ ...run, pricePerNight: price, name, createdBy: by });
  }
  return { deleteIds, create };
}

/**
 * Five colour bands from cheapest to dearest, as on the calendar's legend.
 * Equal prices share a band; one price only is the middle band.
 */
export function priceBand(price: number, lowest: number, highest: number): 0 | 1 | 2 | 3 | 4 {
  if (highest <= lowest) return 2;
  const position = (price - lowest) / (highest - lowest);
  return Math.min(4, Math.floor(position * 5)) as 0 | 1 | 2 | 3 | 4;
}
