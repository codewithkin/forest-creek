import { describe, expect, test } from "bun:test";

import { rankProperties } from "./property-search";

const property = (
  name: string,
  sortOrder: number,
  rooms: Array<[price: number, capacity: number]>,
) => ({
  id: name.toLowerCase(),
  name,
  sortOrder,
  rooms: rooms.map(([pricePerNight, capacity]) => ({ pricePerNight, capacity })),
});

const lodge = property("Lodge", 0, [[90, 2], [140, 4], [180, 2]]);
const cottage = property("Cottage", 1, [[60, 2]]);
const villa = property("Villa", 2, [[300, 8]]);
const empty = property("Annex", 3, []);
const all = [villa, empty, cottage, lodge];

const names = (result: { items: Array<{ name: string }> }) => result.items.map((p) => p.name);

describe("rankProperties", () => {
  test("recommended follows the managers' sort order", () => {
    expect(names(rankProperties(all, {}))).toEqual(["Lodge", "Cottage", "Villa", "Annex"]);
  });

  test("prices each property from its cheapest room and counts rooms", () => {
    const [first] = rankProperties([lodge], {}).items;
    expect(first).toMatchObject({ fromPrice: 90, toPrice: 180, roomCount: 3, maxCapacity: 4 });
  });

  test("a property without published rooms has no price", () => {
    expect(rankProperties([empty], {}).items[0]?.fromPrice).toBeNull();
  });

  test("price bounds keep only properties with a room inside them", () => {
    expect(names(rankProperties(all, { minPrice: 100, maxPrice: 200 }))).toEqual(["Lodge"]);
  });

  test("the from-price reflects the rooms that fit, not the cheapest overall", () => {
    const [first] = rankProperties([lodge], { minPrice: 100 }).items;
    expect(first?.fromPrice).toBe(140);
  });

  test("one room must satisfy price and party size together", () => {
    // Lodge's only 4-sleeper is $140, so a $100 cap with 4 guests rules it out.
    expect(names(rankProperties([lodge], { guests: 4, maxPrice: 100 }))).toEqual([]);
    expect(names(rankProperties([lodge], { guests: 4, maxPrice: 150 }))).toEqual(["Lodge"]);
  });

  test("room filters drop properties with no rooms at all", () => {
    expect(names(rankProperties(all, { guests: 1 }))).not.toContain("Annex");
  });

  test("price sorts put unpriced properties last in both directions", () => {
    expect(names(rankProperties(all, { sort: "price-asc" }))).toEqual([
      "Cottage", "Lodge", "Villa", "Annex",
    ]);
    expect(names(rankProperties(all, { sort: "price-desc" }))).toEqual([
      "Villa", "Lodge", "Cottage", "Annex",
    ]);
  });

  test("paginates and reports the page count", () => {
    const result = rankProperties(all, { sort: "name", page: 2, pageSize: 3 });
    expect(result).toMatchObject({ total: 4, page: 2, pageSize: 3, pageCount: 2 });
    expect(names(result)).toEqual(["Villa"]);
  });

  test("a page past the end clamps to the last page", () => {
    const result = rankProperties(all, { sort: "name", page: 9, pageSize: 3 });
    expect(result.page).toBe(2);
    expect(names(result)).toEqual(["Villa"]);
  });

  test("no matches still reports one (empty) page", () => {
    const result = rankProperties(all, { minPrice: 5000 });
    expect(result).toMatchObject({ total: 0, page: 1, pageCount: 1, items: [] });
  });

  test("defaults to ten per page", () => {
    const many = Array.from({ length: 23 }, (_, i) => property(`P${i}`, i, [[100, 2]]));
    const result = rankProperties(many, {});
    expect(result.items).toHaveLength(10);
    expect(result.pageCount).toBe(3);
  });
});
