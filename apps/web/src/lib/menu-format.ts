/**
 * Menu prices on the web side — the same rules as packages/db/src/menu-rules.ts,
 * which the server, the PDF and the Guide use (the web app does not depend on
 * the db package). Kept to these two functions; change both together.
 */

/** "$4", "$1.50", or "Ask" when the lodge has not set one. */
export function formatMenuPrice(cents: number | null): string {
  if (cents === null) return "Ask";
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** What staff type into a price box, in cents. Blank is no price (null); undefined is not a price. */
export function parseMenuPrice(text: string): number | null | undefined {
  const value = text.trim().replace(/^\$\s*/, "").replace(",", ".");
  if (value === "") return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) return undefined;
  return Math.round(Number(value) * 100);
}

export const MENU_KIND_LABELS = { food: "Food", bar: "Bar" } as const;
export type MenuKind = keyof typeof MENU_KIND_LABELS;
