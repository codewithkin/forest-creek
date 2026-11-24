import { describe, expect, test } from "bun:test";

import { formatMenuPrice, MENU_TEMPLATE, missingTemplateSections, parseMenuPrice } from "./menu-rules";

describe("menu prices", () => {
  test("whole dollars, halves and no price", () => {
    expect(formatMenuPrice(400)).toBe("$4");
    expect(formatMenuPrice(150)).toBe("$1.50");
    expect(formatMenuPrice(null)).toBe("Ask");
    expect(formatMenuPrice(0)).toBe("Free");
  });

  test("what staff type becomes cents; nonsense is refused, blank is no price", () => {
    expect(parseMenuPrice("4")).toBe(400);
    expect(parseMenuPrice("$ 4.5")).toBe(450);
    expect(parseMenuPrice("1,50")).toBe(150);
    expect(parseMenuPrice(" ")).toBeNull();
    expect(parseMenuPrice("four")).toBeUndefined();
    expect(parseMenuPrice("4.555")).toBeUndefined();
  });
});

describe("the starting template", () => {
  test("breakfast leads, and food comes before the bar", () => {
    expect(MENU_TEMPLATE[0]!.name).toBe("Breakfast");
    const firstBar = MENU_TEMPLATE.findIndex((section) => section.kind === "bar");
    expect(MENU_TEMPLATE.slice(firstBar).every((section) => section.kind === "bar")).toBe(true);
  });

  test("adding it again adds only what is missing", () => {
    expect(missingTemplateSections(MENU_TEMPLATE.map((section) => section.name))).toEqual([]);
    expect(missingTemplateSections(["breakfast", "Wines"]).map((section) => section.name)).not.toContain("Breakfast");
    expect(missingTemplateSections([])).toHaveLength(MENU_TEMPLATE.length);
  });
});
