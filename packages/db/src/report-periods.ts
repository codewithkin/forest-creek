// Import-free so it can be unit tested without a database or env.

export const reportPeriods = ["day", "week", "month"] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

/** A span of whole days, [from, to), as YYYY-MM-DD. */
export type DayRange = { from: string; to: string };

const DAY = 86_400_000;
/** Zimbabwe is UTC+2 all year. */
const LODGE_OFFSET_MS = 2 * 3_600_000;

const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const key = (time: number) => new Date(time).toISOString().slice(0, 10);

export function shiftDays(day: string, days: number): string {
  return key(utc(day) + days * DAY);
}

/** The day, Monday-to-Sunday week, or calendar month containing a date. */
export function periodRange(period: ReportPeriod, date: string): DayRange {
  if (period === "day") return { from: date, to: shiftDays(date, 1) };
  if (period === "week") {
    // getUTCDay: Sunday is 0, and a week here starts on Monday.
    const back = (new Date(utc(date)).getUTCDay() + 6) % 7;
    const from = shiftDays(date, -back);
    return { from, to: shiftDays(from, 7) };
  }
  const start = new Date(utc(date));
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  return { from: key(Date.UTC(year, month, 1)), to: key(Date.UTC(year, month + 1, 1)) };
}

/** The period before: yesterday, last week, last month (whatever its length). */
export function previousPeriod(period: ReportPeriod, date: string): DayRange {
  return periodRange(period, shiftDays(periodRange(period, date).from, -1));
}

/** A date in the next or previous period, for the date stepper. */
export function stepPeriod(period: ReportPeriod, date: string, by: 1 | -1): string {
  const range = periodRange(period, date);
  return by === 1 ? range.to : shiftDays(range.from, -1);
}

export function periodLabel(period: ReportPeriod, date: string): string {
  const range = periodRange(period, date);
  const format = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Date(utc(day)).toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
  if (period === "day") return format(range.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (period === "month") return format(range.from, { month: "long", year: "numeric" });
  const last = shiftDays(range.to, -1);
  return `${format(range.from, { day: "numeric", month: "short" })} – ${format(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** The instant a lodge day begins: for timestamps, as opposed to stay dates. */
export function lodgeDayStart(day: string): Date {
  return new Date(utc(day) - LODGE_OFFSET_MS);
}

/** Reports go out from this hour, Zimbabwe time. */
export const REPORT_HOUR = 7;

/**
 * The reports that fall due at a moment: yesterday every morning, last week
 * on Mondays, last month on the 1st, all from REPORT_HOUR on. Each is keyed
 * by its period, so working this out twice sends nothing twice.
 */
export function dueReports(now: Date): { period: ReportPeriod; date: string }[] {
  const lodge = new Date(now.getTime() + LODGE_OFFSET_MS);
  if (lodge.getUTCHours() < REPORT_HOUR) return [];
  const today = key(lodge.getTime());
  const yesterday = shiftDays(today, -1);
  const due: { period: ReportPeriod; date: string }[] = [{ period: "day", date: yesterday }];
  if (lodge.getUTCDay() === 1) due.push({ period: "week", date: yesterday });
  if (lodge.getUTCDate() === 1) due.push({ period: "month", date: yesterday });
  return due;
}
