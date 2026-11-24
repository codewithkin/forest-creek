import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createMenuItem, createMenuSection, prisma } from "@forest-creek/db";

import { getMenuTool } from "./menu-tool";

const SLUG = "menu-tool-test";
const run = (input: object) =>
  (getMenuTool.execute as (i: object, c: unknown) => Promise<Record<string, unknown>>)(input, {});
const remove = async () => { await prisma.property.deleteMany({ where: { slug: { startsWith: SLUG } } }); };

beforeAll(async () => {
  await remove();
  const base = { tagline: "-", description: "-", location: "-", phone: "+263 71 995 6882", email: "m@example.com", heroImage: "/media/x.jpg", sortOrder: 999 };
  const property = await prisma.property.create({ data: { ...base, slug: SLUG, name: "Menu Lodge", breakfastIncluded: true } });
  await prisma.property.create({ data: { ...base, slug: `${SLUG}-none`, name: "No Menu Lodge" } });
  const breakfast = await createMenuSection({ propertyId: property.id, name: "Breakfast", kind: "food" });
  await createMenuItem({ sectionId: breakfast.id, name: "Full English", priceCents: 850, tags: ["House favourite"] });
  const beers = await createMenuSection({ propertyId: property.id, name: "Beers", kind: "bar" });
  const castle = await createMenuItem({ sectionId: beers.id, name: "Castle Lager", priceCents: 200 });
  await prisma.menuItem.update({ where: { id: castle.id }, data: { available: false } });
  await createMenuSection({ propertyId: property.id, name: "Empty", kind: "food" });
});
afterAll(remove);

describe("get-menu", () => {
  test("dishes and drinks with their prices, sold out marked, empty sections left out", async () => {
    const result = await run({ propertySlug: SLUG, kind: "all" });
    expect(result).toMatchObject({ ok: true, breakfastIncluded: true });
    expect(result.sections).toEqual([
      { section: "Breakfast", part: "food", note: null, items: [{ name: "Full English", price: "$8.50", labels: ["House favourite"] }] },
      { section: "Beers", part: "bar", note: null, items: [{ name: "Castle Lager", price: "$2", soldOut: true }] },
    ]);
    expect(result.menuPageUrl).toContain(`/menu?property=${SLUG}`);
  });

  test("only the bar when that is all the guest asked", async () => {
    const result = await run({ propertySlug: SLUG, kind: "bar" });
    expect((result.sections as { section: string }[]).map((section) => section.section)).toEqual(["Beers"]);
  });

  test("a lodge with no menu online says so instead of inventing one", async () => {
    const result = await run({ propertySlug: `${SLUG}-none`, kind: "all" });
    expect(result.sections).toEqual([]);
    expect(String(result.howToReply)).toContain("Never describe dishes");
  });
});
