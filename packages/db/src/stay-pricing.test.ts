import { describe, expect, test } from "bun:test";

import { nightlyRates, periodsOverlap, priceStay, rateOnDate, stayRevenueBetween } from "./stay-pricing";

const day = (value: string) => new Date(value + "T00:00:00Z");
// Christmas week costs $200 a night instead of $120.
const christmas = { startDate: day("2026-12-24"), endDate: day("2026-12-27"), pricePerNight: 200, name: "Christmas" };

describe("priceStay", () => {
  test("no period: every night at the room's own rate", () => {
    expect(priceStay(120, [], "2026-11-01", "2026-11-04")).toEqual({
      nightlyRates: [120, 120, 120],
      subtotal: 360,
      averageRate: 120,
    });
  });

  test("the arrival date's price is charged for every night, whatever the later dates show", () => {
    // Arrive before Christmas: the $120 rate holds through the $200 nights.
    expect(priceStay(120, [christmas], "2026-12-22", "2026-12-26")).toEqual({
      nightlyRates: [120, 120, 120, 120],
      subtotal: 480,
      averageRate: 120,
    });
    // Arrive at Christmas: $200 every night, even past its end.
    expect(priceStay(120, [christmas], "2026-12-26", "2026-12-29").subtotal).toBe(600);
  });

  // The client's own example: 29th $120, 30th $300, 31st $120.
  test("seen in the client's message: leave on the 31st", () => {
    const spike = { startDate: day("2026-10-30"), endDate: day("2026-10-31"), pricePerNight: 300 };
    expect(priceStay(120, [spike], "2026-10-29", "2026-10-31").subtotal).toBe(240);
    expect(priceStay(120, [spike], "2026-10-30", "2026-10-31").subtotal).toBe(300);
  });

  test("no nights, no charge", () => {
    expect(priceStay(120, [], "2026-11-01", "2026-11-01")).toEqual({ nightlyRates: [], subtotal: 0, averageRate: 120 });
  });

  test("each date keeps its own price for the calendar", () => {
    expect(nightlyRates(120, [christmas], "2026-12-23", "2026-12-25")).toEqual([120, 200]);
    expect(rateOnDate(120, [christmas], "2026-12-24")).toBe(200);
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
