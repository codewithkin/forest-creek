import { describe, expect, test } from "bun:test";

import { dueReports, lodgeDayStart, periodLabel, periodRange, previousPeriod, stepPeriod } from "./report-periods";

describe("periodRange", () => {
  test("a day is that day", () => {
    expect(periodRange("day", "2026-11-04")).toEqual({ from: "2026-11-04", to: "2026-11-05" });
  });

  test("a week runs Monday to Sunday, from any day in it", () => {
    for (const day of ["2026-11-02", "2026-11-04", "2026-11-08"]) {
      expect(periodRange("week", day)).toEqual({ from: "2026-11-02", to: "2026-11-09" });
    }
  });

  test("a month is the calendar month, across a year end too", () => {
    expect(periodRange("month", "2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-03-01" });
    expect(periodRange("month", "2026-12-31")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
});

describe("comparing and stepping", () => {
  test("the previous period is the real one before, whatever its length", () => {
    expect(previousPeriod("day", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-03-01" });
    expect(previousPeriod("week", "2026-11-04")).toEqual({ from: "2026-10-26", to: "2026-11-02" });
    expect(previousPeriod("month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-03-01" });
  });

  test("stepping lands in the next or previous period", () => {
    expect(stepPeriod("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepPeriod("month", "2026-03-15", -1)).toBe("2026-02-28");
    expect(stepPeriod("week", "2026-11-04", 1)).toBe("2026-11-09");
  });

  test("labels read naturally", () => {
    expect(periodLabel("day", "2026-11-02")).toBe("Monday, 2 November 2026");
    expect(periodLabel("week", "2026-11-04")).toBe("2 Nov – 8 Nov 2026");
    expect(periodLabel("month", "2026-11-04")).toBe("November 2026");
  });
});

test("a lodge day starts at midnight in Zimbabwe, 22:00 UTC the day before", () => {
  expect(lodgeDayStart("2026-11-02").toISOString()).toBe("2026-11-01T22:00:00.000Z");
});

describe("dueReports", () => {
  const at = (iso: string) => dueReports(new Date(iso));

  test("nothing before seven in the morning, Zimbabwe time", () => {
    expect(at("2026-11-03T04:59:00Z")).toEqual([]);
  });

  test("yesterday's report every morning", () => {
    expect(at("2026-11-04T05:00:00Z")).toEqual([{ period: "day", date: "2026-11-03" }]);
  });

  test("Mondays add last week", () => {
    expect(at("2026-11-09T06:00:00Z")).toEqual([
      { period: "day", date: "2026-11-08" },
      { period: "week", date: "2026-11-08" },
    ]);
  });

  test("the 1st adds last month", () => {
    expect(at("2026-12-01T06:00:00Z")).toEqual([
      { period: "day", date: "2026-11-30" },
      { period: "month", date: "2026-11-30" },
    ]);
  });
});
