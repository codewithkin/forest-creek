/**
 * The menu's rules: kinds, prices, and the starting template. Import-free, so
 * they are unit tested and shared by the page, the PDF and the Guide.
 */

export const menuKinds = ["food", "bar"] as const;
export type MenuKind = (typeof menuKinds)[number];

export const MENU_KIND_LABELS: Record<MenuKind, string> = { food: "Food", bar: "Bar" };

/** "$4", "$1.50", or "Ask" when the lodge has not set one. */
export function formatMenuPrice(cents: number | null): string {
  if (cents === null) return "Ask";
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * What staff type into a price box, in cents: "4", "$4", "1.5", "1,50". Blank
 * is "no price" (null). Anything else is undefined, for the form to refuse.
 */
export function parseMenuPrice(text: string): number | null | undefined {
  const value = text.trim().replace(/^\$\s*/, "").replace(",", ".");
  if (value === "") return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) return undefined;
  return Math.round(Number(value) * 100);
}

/**
 * The sections a lodge's menu usually has, to start from instead of a blank
 * page. Breakfast leads: most night bookings take it. Staff rename, hide or
 * delete any of them.
 */
export const MENU_TEMPLATE: { name: string; kind: MenuKind; note?: string }[] = [
  { name: "Breakfast", kind: "food", note: "Served 7 to 10am" },
  { name: "Light meals", kind: "food" },
  { name: "Mains", kind: "food" },
  { name: "Sides", kind: "food" },
  { name: "Desserts", kind: "food" },
  { name: "Hot drinks", kind: "bar" },
  { name: "Soft drinks & juices", kind: "bar" },
  { name: "Beers & ciders", kind: "bar" },
  { name: "Wines", kind: "bar" },
  { name: "Spirits", kind: "bar" },
];

/** Template sections a menu does not have yet (by name, ignoring case), so adding it twice adds nothing. */
export function missingTemplateSections(existingNames: string[]) {
  const have = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  return MENU_TEMPLATE.filter((section) => !have.has(section.name.toLowerCase()));
}
