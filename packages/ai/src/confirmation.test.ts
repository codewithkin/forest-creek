import { describe, expect, test } from "bun:test";

import { bookingDetailsKey, ConfirmationGate, type BookingDetails } from "./confirmation";

const details: BookingDetails = {
  propertySlug: "forest-creek",
  roomTier: "standard",
  checkIn: "2041-02-01",
  checkOut: "2041-02-03",
  guests: 2,
  guestName: "Eval Guest",
  guestEmail: "guest@example.com",
  activitySlugs: ["braai", "hike"],
  paymentMethod: "bank_transfer",
};
const key = bookingDetailsKey(details);
const guest = "+263700000001";

describe("ConfirmationGate", () => {
  test("the first call for a booking only asks for confirmation", () => {
    expect(new ConfirmationGate().decide(guest, key, "turn-1")).toBe("confirm");
  });

  test("calling again in the same turn still books nothing — the guest has not replied", () => {
    const gate = new ConfirmationGate();
    gate.decide(guest, key, "turn-1");
    expect(gate.decide(guest, key, "turn-1")).toBe("confirm");
  });

  test("the same details in a later turn make the booking", () => {
    const gate = new ConfirmationGate();
    gate.decide(guest, key, "turn-1");
    expect(gate.decide(guest, key, "turn-2")).toBe("create");
  });

  test("a confirmation is used up, so a repeat cannot book twice", () => {
    const gate = new ConfirmationGate();
    gate.decide(guest, key, "turn-1");
    gate.decide(guest, key, "turn-2");
    expect(gate.decide(guest, key, "turn-3")).toBe("confirm");
  });

  test("changed details need a fresh read-back", () => {
    const gate = new ConfirmationGate();
    gate.decide(guest, key, "turn-1");
    const changed = bookingDetailsKey({ ...details, guests: 3 });
    expect(gate.decide(guest, changed, "turn-2")).toBe("confirm");
    expect(gate.decide(guest, changed, "turn-3")).toBe("create");
  });

  test("a stale read-back expires", () => {
    let now = 0;
    const gate = new ConfirmationGate({ ttlMs: 1_000, now: () => now });
    gate.decide(guest, key, "turn-1");
    now = 5_000;
    expect(gate.decide(guest, key, "turn-2")).toBe("confirm");
  });

  test("one guest's read-back never confirms another guest's booking", () => {
    const gate = new ConfirmationGate();
    gate.decide(guest, key, "turn-1");
    expect(gate.decide("+263700000002", key, "turn-2")).toBe("confirm");
  });
});

describe("bookingDetailsKey", () => {
  test("ignores casing, spacing and experience order", () => {
    expect(
      bookingDetailsKey({
        ...details,
        guestName: "  eval   GUEST ",
        guestEmail: "Guest@Example.com",
        activitySlugs: ["hike", "braai"],
      }),
    ).toBe(key);
  });

  test("differs when a real detail changes", () => {
    expect(bookingDetailsKey({ ...details, checkOut: "2041-02-04" })).not.toBe(key);
  });
});
