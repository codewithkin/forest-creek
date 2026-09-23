/*
 * Month arithmetic for the availability calendar. Import-free so it can be
 * unit tested without React, the API or a database.
 *
 * Everything works in UTC. Stay dates are stored as UTC midnights, and a
 * browser in Harare formatting them locally slides every stay a day — the
 * bookings table has the same note for the same reason.
 */

export type Stay = {
  bookingId: string;
  reference: string;
  guestName: string;
  /** YYYY-MM-DD, the arrival day. */
  checkIn: string;
  /** YYYY-MM-DD, the departure day. */
  checkOut: string;
  nights: number;
  paymentStatus: string;
  channel: string;
};

export type MonthCursor = { year: number; month: number };

/** YYYY-MM-DD for a day of the cursor's month. Month may overflow, as JS allows. */
export function dayKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month, day));
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

export function shiftMonth(cursor: MonthCursor, by: number): MonthCursor {
  const next = new Date(Date.UTC(cursor.year, cursor.month + by, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
}

/** The first day of the month, and the first day of the NEXT one. */
export function monthRange(cursor: MonthCursor): { from: string; to: string } {
  return {
    from: dayKey(cursor.year, cursor.month, 1),
    to: dayKey(cursor.year, cursor.month + 1, 1),
  };
}

/**
 * A night belongs to the stay that arrived on or before it and leaves after
 * it. The departure day itself is free: one guest checks out the morning the
 * next checks in, which is exactly how isRoomAvailable treats the boundary.
 */
export function stayOn(stays: Stay[], day: string): Stay | undefined {
  return stays.find((stay) => stay.checkIn <= day && day < stay.checkOut);
}

export type Block = {
  id: string;
  /** YYYY-MM-DD, first blocked night. */
  from: string;
  /** YYYY-MM-DD, the morning the room opens again. */
  to: string;
  reason: string;
  createdBy: string;
};

/** The block covering a night, by the same boundary rule as stayOn. */
export function blockOn(blocks: Block[], day: string): Block | undefined {
  return blocks.find((block) => block.from <= day && day < block.to);
}
