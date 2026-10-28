import { describe, expect, test } from "bun:test";

import { nightRuns, planNightlyPrices, priceBand, type StoredPeriod } from "./price-calendar-plan";

const d = (day: string) => new Date(day + "T00:00:00Z");
const week: StoredPeriod = {
  id: "p1",
  startDate: d("2030-10-01"),
  endDate: d("2030-10-08"),
  pricePerNight: 90,
  name: "Festival week",
  createdBy: "a@x",
};

describe("nightRuns", () => {
  test("groups consecutive nights, in any order", () => {
    expect(nightRuns(["2030-10-03", "2030-10-01", "2030-10-02", "2030-10-05"])).toEqual([
      { startDate: d("2030-10-01"), endDate: d("2030-10-04") },
      { startDate: d("2030-10-05"), endDate: d("2030-10-06") },
    ]);
  });
});

describe("planNightlyPrices", () => {
  test("pricing nights inside a longer period cuts it around them", () => {
    const plan = planNightlyPrices([week], ["2030-10-03", "2030-10-04"], 120, "Calendar price", "b@x");
    expect(plan.deleteIds).toEqual(["p1"]);
    expect(plan.create).toEqual([
      { startDate: d("2030-10-01"), endDate: d("2030-10-03"), pricePerNight: 90, name: "Festival week", createdBy: "a@x" },
      { startDate: d("2030-10-05"), endDate: d("2030-10-08"), pricePerNight: 90, name: "Festival week", createdBy: "a@x" },
      { startDate: d("2030-10-03"), endDate: d("2030-10-05"), pricePerNight: 120, name: "Calendar price", createdBy: "b@x" },
    ]);
  });

  test("clearing a price puts those nights back on the room's own rate", () => {
    const plan = planNightlyPrices([week], ["2030-10-01"], null, "Calendar price", "b@x");
    expect(plan.deleteIds).toEqual(["p1"]);
    expect(plan.create).toEqual([
      { startDate: d("2030-10-02"), endDate: d("2030-10-08"), pricePerNight: 90, name: "Festival week", createdBy: "a@x" },
    ]);
  });

  test("periods that don't touch the chosen nights are left alone", () => {
    const plan = planNightlyPrices([week], ["2030-11-01"], 70, "Calendar price", "b@x");
    expect(plan.deleteIds).toEqual([]);
    expect(plan.create).toHaveLength(1);
  });
});

describe("priceBand", () => {
  test("spreads prices over five bands, cheapest to dearest", () => {
    expect(priceBand(45, 45, 90)).toBe(0);
    expect(priceBand(90, 45, 90)).toBe(4);
    expect(priceBand(70, 45, 90)).toBe(2);
    expect(priceBand(60, 60, 60)).toBe(2);
  });
});
