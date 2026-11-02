import { describe, expect, test } from "bun:test";

import {
  bookingHabits,
  buildInsights,
  channelMix,
  monthlySeries,
  monthsBetween,
  performance,
  rankByProperty,
  rankByRoom,
  topExperiences,
  weekdayDemand,
  type InsightFacts,
  type Ranked,
  type TrendStay,
} from "./trend-math";

const d = (day: string) => new Date(`${day}T00:00:00Z`);

function stay(checkIn: string, checkOut: string, rate: number, extra: Partial<TrendStay> = {}): TrendStay {
  const nights = Math.round((d(checkOut).getTime() - d(checkIn).getTime()) / 86_400_000);
  return {
    propertyId: "a",
    propertyName: "Lodge",
    roomId: "r1",
    roomName: "Suite",
    checkIn: d(checkIn),
    checkOut: d(checkOut),
    roomRate: rate,
    nightlyRates: Array.from({ length: nights }, () => rate),
    subtotal: rate * nights,
    totalAmount: rate * nights,
    channel: "web",
    activityNames: [],
    createdAt: d(checkIn),
    ...extra,
  };
}

describe("performance", () => {
  test("a stay across the edge only counts the nights inside", () => {
    const result = performance([stay("2026-01-30", "2026-02-03", 100)], d("2026-02-01"), d("2026-03-01"), 1);
    expect(result).toMatchObject({ nightsSold: 2, roomRevenue: 200, nightsAvailable: 28 });
  });

  test("RevPAR is ADR times occupancy", () => {
    const { adr, occupancy, revpar } = performance(
      [stay("2026-02-01", "2026-02-04", 120), stay("2026-02-10", "2026-02-12", 300)],
      d("2026-02-01"),
      d("2026-03-01"),
      3,
    );
    expect(revpar).toBeCloseTo(adr * occupancy, 9);
  });

  test("nothing sold and no rooms are zero, not a crash", () => {
    expect(performance([], d("2026-02-01"), d("2026-03-01"), 0)).toMatchObject({ occupancy: 0, adr: 0, revpar: 0 });
  });

  test("older bookings with each date's own price keep what they were charged", () => {
    const old = stay("2026-02-01", "2026-02-03", 200, { nightlyRates: [120, 280] });
    expect(performance([old], d("2026-02-01"), d("2026-03-01"), 1).roomRevenue).toBe(400);
  });
});

describe("months", () => {
  test("clips the first and last month to the window", () => {
    expect(monthsBetween(d("2026-01-15"), d("2026-03-10")).map(({ month, start, end }) => [month, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)])).toEqual([
      ["2026-01", "2026-01-15", "2026-02-01"],
      ["2026-02", "2026-02-01", "2026-03-01"],
      ["2026-03", "2026-03-01", "2026-03-10"],
    ]);
  });

  test("a stay across months lands in both, and adds up", () => {
    const series = monthlySeries([stay("2026-01-30", "2026-02-03", 100)], d("2026-01-01"), d("2026-03-01"), 1);
    expect(series.map((month) => month.nightsSold)).toEqual([2, 2]);
    expect(series.reduce((sum, month) => sum + month.roomRevenue, 0)).toBe(400);
  });
});

describe("ranking", () => {
  const stays = [
    stay("2026-02-01", "2026-02-11", 100, { propertyId: "a", propertyName: "Lodge" }),
    stay("2026-02-01", "2026-02-05", 400, { propertyId: "b", propertyName: "Cottages", roomId: "r2", roomName: "Loft" }),
  ];
  const counts = [
    { propertyId: "a", propertyName: "Lodge", activeRooms: 1 },
    { propertyId: "b", propertyName: "Cottages", activeRooms: 1 },
    { propertyId: "c", propertyName: "Empty", activeRooms: 2 },
  ];

  test("properties rank by revenue, keeping those with nothing sold", () => {
    const ranked = rankByProperty(stays, counts, d("2026-02-01"), d("2026-03-01"));
    expect(ranked.map((row) => row.name)).toEqual(["Cottages", "Lodge", "Empty"]);
    expect(ranked[0]!.share).toBeCloseTo(1600 / 2600, 9);
    expect(ranked.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 9);
  });

  test("rooms rank by revenue, each against its own nights", () => {
    const ranked = rankByRoom(stays, d("2026-02-01"), d("2026-03-01"));
    expect(ranked[0]).toMatchObject({ name: "Loft, Cottages", nightsSold: 4 });
    expect(ranked[1]!.occupancy).toBeCloseTo(10 / 28, 9);
  });
});

describe("habits", () => {
  test("channels by value, with counts", () => {
    const mix = channelMix([stay("2026-02-01", "2026-02-02", 100), stay("2026-02-03", "2026-02-04", 300, { channel: "whatsapp" }), stay("2026-02-05", "2026-02-06", 100)]);
    expect(mix).toEqual([
      { channel: "whatsapp", bookings: 1, value: 300 },
      { channel: "web", bookings: 2, value: 200 },
    ]);
  });

  test("lead time and length of stay", () => {
    const habits = bookingHabits([
      stay("2026-02-11", "2026-02-13", 100, { createdAt: d("2026-02-01") }),
      stay("2026-02-21", "2026-02-25", 100, { createdAt: d("2026-02-01") }),
    ]);
    expect(habits).toEqual({ leadDays: 15, stayNights: 3 });
  });

  test("weekdays count each night, Monday first", () => {
    // 2 Feb 2026 is a Monday: nights of Monday and Tuesday.
    const demand = weekdayDemand([stay("2026-02-02", "2026-02-04", 100)], d("2026-02-01"), d("2026-03-01"));
    expect(demand.map((row) => row.nights)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  test("experiences by popularity", () => {
    const list = topExperiences([
      stay("2026-02-01", "2026-02-02", 100, { activityNames: ["Braai", "Hike"] }),
      stay("2026-02-03", "2026-02-04", 100, { activityNames: ["Braai"] }),
    ]);
    expect(list).toEqual([{ name: "Braai", count: 2 }, { name: "Hike", count: 1 }]);
  });
});

describe("buildInsights", () => {
  const row = (key: string, name: string, roomRevenue: number, share: number, occupancy: number): Ranked => ({
    key, name, roomRevenue, share, occupancy, nightsSold: 10, nightsAvailable: 30, adr: 100, revpar: 50,
  });
  const facts: InsightFacts = {
    stays: 20,
    properties: [row("a", "Forest Creek Lodge", 6200, 0.62, 0.4), row("b", "Misty Ridge", 3800, 0.38, 0.55)],
    previousProperties: [row("a", "Forest Creek Lodge", 5000, 0.6, 0.3)],
    months: [
      { month: "2026-06", roomRevenue: 3000, occupancy: 0.5 },
      { month: "2026-07", roomRevenue: 5000, occupancy: 0.6 },
      { month: "2026-08", roomRevenue: 1000, occupancy: 0.2 },
    ],
    bestWeekday: "Saturday",
    quietestWeekday: "Tuesday",
    channels: [{ channel: "whatsapp", bookings: 12, value: 7000 }, { channel: "web", bookings: 8, value: 3000 }],
    leadDays: 21.4,
    conversion: 0.4,
    cancellationRate: 0.2,
    forward30: { occupancy: 0.1 },
  };

  test("says what the numbers say, in plain words", () => {
    const lines = buildInsights(facts);
    expect(lines[0]).toBe("Forest Creek Lodge is the best performer, earning 62% of room revenue, up 24% on the period before.");
    expect(lines).toContain("Misty Ridge is the fullest, at 55% occupancy, while Forest Creek Lodge earns more per night.");
    expect(lines.join(" ")).toContain("July was the strongest month and August the quietest");
    expect(lines).toContain("Saturday nights sell best and Tuesday nights least.");
    expect(lines).toContain("Most booking value comes through WhatsApp (12 of 20 bookings).");
    expect(lines.join(" ")).toContain("about 21 days ahead");
    expect(lines.join(" ")).toContain("Only 40% of bookings end up confirmed");
    expect(lines.join(" ")).toContain("next 30 days are 10% booked");
  });

  test("too few stays say nothing, rather than a false trend", () => {
    expect(buildInsights({ ...facts, stays: 4 })).toEqual([]);
  });

  test("healthy figures raise no alarm, and one property has no rival", () => {
    const lines = buildInsights({ ...facts, properties: [facts.properties[0]!], conversion: 0.8, cancellationRate: 0.05, forward30: { occupancy: 0.5 } });
    expect(lines.join(" ")).not.toContain("best performer");
    expect(lines.join(" ")).not.toContain("end up confirmed");
    expect(lines.join(" ")).not.toContain("cancelled");
    expect(lines.join(" ")).not.toContain("room to promote");
  });
});
