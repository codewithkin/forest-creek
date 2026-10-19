import { describe, expect, test } from "bun:test";

import { nightlyRates, periodsOverlap, priceStay, stayRevenueBetween } from "./stay-pricing";

const day = (value: string) => new Date(value + "T00:00:00Z");
// Christmas week costs $200 a night instead of $120.
const christmas = { startDate: day("2026-12-24"), endDate: day("2026-12-27"), pricePerNight: 200, name: "Christmas" };

describe("priceStay", () => {
  test("no period: every night at the room's own rate", () => {
    expect(priceStay(120, [], "2026-11-01", "2026-11-04")).toEqual({
      nightlyRates: [120, 120, 120],
      subtotal: 360,
      averageRate: 120,
      varies: false,
    });
  });

  test("a stay crossing into a period pays each night's own price", () => {
    // Nights of the 22nd, 23rd (normal), 24th, 25th (Christmas).
    expect(priceStay(120, [christmas], "2026-12-22", "2026-12-26")).toEqual({
      nightlyRates: [120, 120, 200, 200],
      subtotal: 640,
      averageRate: 160,
      varies: true,
    });
  });

  test("the period's end date is the first night back at the normal price", () => {
    expect(nightlyRates(120, [christmas], "2026-12-26", "2026-12-28")).toEqual([200, 120]);
  });

  test("arriving on the period's last morning out is not inside it", () => {
    expect(nightlyRates(120, [christmas], "2026-12-27", "2026-12-28")).toEqual([120]);
  });
});

describe("periodsOverlap", () => {
  test("touching ranges share no night; overlapping ones do", () => {
    expect(periodsOverlap(christmas, { startDate: day("2026-12-27"), endDate: day("2026-12-31") })).toBe(false);
    expect(periodsOverlap(christmas, { startDate: day("2026-12-26"), endDate: day("2026-12-31") })).toBe(true);
  });
});

describe("stayRevenueBetween", () => {
  const stay = { checkIn: day("2026-12-22"), checkOut: day("2026-12-26"), roomRate: 160, nightlyRates: [120, 120, 200, 200] };

  test("counts each night at the price it was booked at, inside the window only", () => {
    expect(stayRevenueBetween(stay, day("2026-12-01"), day("2027-01-01"))).toBe(640);
    expect(stayRevenueBetween(stay, day("2026-12-24"), day("2027-01-01"))).toBe(400);
  });

  test("a booking from before prices by date uses its roomRate every night", () => {
    expect(stayRevenueBetween({ ...stay, roomRate: 120, nightlyRates: [] }, day("2026-12-01"), day("2027-01-01"))).toBe(480);
  });
});
