// The Next app's tsconfig does not set `types`, so @types/bun is not pulled in
// globally the way the base config does it for packages/*. Referencing it here
// keeps bun:test typed without changing what the app itself compiles against.
/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import {
  blockOn,
  dayKey,
  daysInMonth,
  monthLabel,
  monthRange,
  shiftMonth,
  stayOn,
  type Stay,
} from "./calendar-month";

function stay(checkIn: string, checkOut: string, reference = "FC-TEST01"): Stay {
  return {
    bookingId: reference,
    reference,
    guestName: "Guest",
    checkIn,
    checkOut,
    nights: 1,
    paymentStatus: "verified",
    channel: "web",
  };
}

describe("dayKey", () => {
  it("pads the month and day", () => {
    expect(dayKey(2026, 0, 5)).toBe("2026-01-05");
  });

  it("rolls a month overflow into the next year", () => {
    expect(dayKey(2026, 12, 1)).toBe("2027-01-01");
  });
});

describe("daysInMonth", () => {
  it("knows the short months", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 11)).toBe(31);
  });

  it("knows a leap February", () => {
    expect(daysInMonth(2028, 1)).toBe(29);
  });
});

describe("monthRange", () => {
  it("ends on the first of the next month, which the query treats as exclusive", () => {
    expect(monthRange({ year: 2026, month: 8 })).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });
  });

  it("crosses the year boundary", () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({
      from: "2026-12-01",
      to: "2027-01-01",
    });
  });
});

describe("shiftMonth", () => {
  it("steps back over January", () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("steps forward over December", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });
});

describe("monthLabel", () => {
  it("names the month in UTC, not the reader's zone", () => {
    expect(monthLabel(2026, 8)).toBe("September 2026");
  });
});

describe("stayOn", () => {
  const stays = [stay("2026-09-10", "2026-09-14", "FC-AAA111")];

  it("fills every night of the stay", () => {
    for (const day of ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]) {
      expect(stayOn(stays, day)?.reference).toBe("FC-AAA111");
    }
  });

  it("leaves the departure day free — the next guest checks in that morning", () => {
    expect(stayOn(stays, "2026-09-14")).toBeUndefined();
  });

  it("leaves the day before arrival free", () => {
    expect(stayOn(stays, "2026-09-09")).toBeUndefined();
  });

  it("lets two stays share a boundary date", () => {
    const backToBack = [
      stay("2026-09-10", "2026-09-14", "FC-AAA111"),
      stay("2026-09-14", "2026-09-16", "FC-BBB222"),
    ];
    expect(stayOn(backToBack, "2026-09-13")?.reference).toBe("FC-AAA111");
    expect(stayOn(backToBack, "2026-09-14")?.reference).toBe("FC-BBB222");
  });

  it("returns nothing when the room is empty", () => {
    expect(stayOn([], "2026-09-12")).toBeUndefined();
  });
});

describe("blockOn", () => {
  const blocks = [{ id: "b1", from: "2026-09-10", to: "2026-09-12", reason: "Paint", createdBy: "a@b.co" }];

  it("covers each blocked night", () => {
    expect(blockOn(blocks, "2026-09-10")?.id).toBe("b1");
    expect(blockOn(blocks, "2026-09-11")?.id).toBe("b1");
  });

  it("leaves the morning it reopens free", () => {
    expect(blockOn(blocks, "2026-09-12")).toBeUndefined();
  });
});
