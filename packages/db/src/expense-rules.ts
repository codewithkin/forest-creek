/**
 * Expenses and the profit & loss, as plain arithmetic: import-free, so every
 * figure is unit tested by hand.
 *
 * The profit & loss is CASH: money that came in during a month against money
 * that went out. In: booking payments (receipts, whenever the stay is) and
 * paid invoices that are not for a booking (a booking's invoice is already in
 * its receipts). Out: refunds paid, expenses, and wages paid (net, as handed
 * over). Earned-but-unpaid stays and unpaid maybes are in neither, exactly as
 * in the reports. All money here is CENTS.
 */

export const expenseMethods = ["cash", "bank_transfer", "ecocash", "card", "other"] as const;
export type ExpenseMethod = (typeof expenseMethods)[number];

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  ecocash: "EcoCash",
  card: "Card",
  other: "Other",
};

/** The longest profit & loss asked for at once. */
export const MAX_PNL_MONTHS = 36;

/** Zimbabwe is UTC+2 all year. */
const LODGE_OFFSET_MS = 2 * 3_600_000;

const monthIndex = (month: string) => {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return year * 12 + (number - 1);
};
const monthOfIndex = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

/** Every month from `from` to `to`, both included (YYYY-MM). Empty when they are the wrong way round. */
export function monthKeysBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let index = monthIndex(from); index <= monthIndex(to); index++) months.push(monthOfIndex(index));
  return months;
}

/** The first day of a month, and the first day after another: [start, end) as YYYY-MM-DD. */
export function monthSpan(from: string, to: string): { start: string; end: string } {
  return { start: `${from}-01`, end: `${monthOfIndex(monthIndex(to) + 1)}-01` };
}

/** The lodge's month a moment falls in (Zimbabwe time): for timestamps such as a receipt's. */
export function lodgeMonth(moment: Date): string {
  return new Date(moment.getTime() + LODGE_OFFSET_MS).toISOString().slice(0, 7);
}

/** The month of a calendar date stored at UTC midnight: an expense's day, an invoice's date. */
export function dateMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** One amount in a month. `category` only for expenses (null: uncategorised). */
export type MonthAmount = { month: string; cents: number; category?: string | null };

export type PnlFigures = {
  bookings: number;
  invoices: number;
  moneyIn: number;
  refunds: number;
  expenses: number;
  wages: number;
  moneyOut: number;
  profit: number;
  /** Profit as a share of money in; null when nothing came in. */
  margin: number | null;
};

export type ProfitAndLoss = {
  months: (PnlFigures & { month: string; label: string })[];
  total: PnlFigures;
  /** Biggest first; `share` of all expenses. */
  expensesByCategory: { category: string; cents: number; share: number }[];
};

export const NO_EXPENSE_CATEGORY = "No category";

function figures(bookings: number, invoices: number, refunds: number, expenses: number, wages: number): PnlFigures {
  const moneyIn = bookings + invoices;
  const moneyOut = refunds + expenses + wages;
  const profit = moneyIn - moneyOut;
  return { bookings, invoices, moneyIn, refunds, expenses, wages, moneyOut, profit, margin: moneyIn > 0 ? profit / moneyIn : null };
}

/** Lays the amounts out month by month, with totals. Amounts outside the months are ignored. */
export function buildProfitAndLoss(
  months: string[],
  amounts: { bookings: MonthAmount[]; invoices: MonthAmount[]; refunds: MonthAmount[]; expenses: MonthAmount[]; wages: MonthAmount[] },
): ProfitAndLoss {
  const wanted = new Set(months);
  const byMonth = (rows: MonthAmount[]) => {
    const sums = new Map<string, number>();
    for (const row of rows) if (wanted.has(row.month)) sums.set(row.month, (sums.get(row.month) ?? 0) + row.cents);
    return sums;
  };
  const bookings = byMonth(amounts.bookings);
  const invoices = byMonth(amounts.invoices);
  const refunds = byMonth(amounts.refunds);
  const expenses = byMonth(amounts.expenses);
  const wages = byMonth(amounts.wages);
  const of = (sums: Map<string, number>, month: string) => sums.get(month) ?? 0;
  const all = (sums: Map<string, number>) => [...sums.values()].reduce((total, cents) => total + cents, 0);

  const categories = new Map<string, number>();
  for (const row of amounts.expenses) {
    if (!wanted.has(row.month)) continue;
    const name = row.category ?? NO_EXPENSE_CATEGORY;
    categories.set(name, (categories.get(name) ?? 0) + row.cents);
  }
  const expenseTotal = all(expenses);

  return {
    months: months.map((month) => ({
      month,
      label: monthName(month),
      ...figures(of(bookings, month), of(invoices, month), of(refunds, month), of(expenses, month), of(wages, month)),
    })),
    total: figures(all(bookings), all(invoices), all(refunds), expenseTotal, all(wages)),
    expensesByCategory: [...categories]
      .map(([category, cents]) => ({ category, cents, share: expenseTotal > 0 ? cents / expenseTotal : 0 }))
      .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category)),
  };
}
