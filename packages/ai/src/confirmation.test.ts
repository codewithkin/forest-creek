import { describe, expect, test } from "bun:test";

import { bookingDetailsKey, changedFields, ConfirmationGate, type BookingDetails } from "./confirmation";

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
  test("the first call for a booking only asks for confirmation", async () => {
    expect(await new ConfirmationGate().decide(guest, details, "turn-1")).toMatchObject({ decision: "confirm", askedThisTurn: false });
  });

  test("calling again in the same turn still books nothing — and says it already asked", async () => {
    const gate = new ConfirmationGate();
    await gate.decide(guest, details, "turn-1");
    expect(await gate.decide(guest, details, "turn-1")).toMatchObject({ decision: "confirm", askedThisTurn: true });
  });

  test("the same details in a later turn make the booking", async () => {
    const gate = new ConfirmationGate();
    await gate.decide(guest, details, "turn-1");
    expect(await gate.decide(guest, details, "turn-2")).toEqual({ decision: "create" });
  });

  test("a confirmation is used up, so a repeat cannot book twice", async () => {
    const gate = new ConfirmationGate();
    await gate.decide(guest, details, "turn-1");
    await gate.decide(guest, details, "turn-2");
    expect((await gate.decide(guest, details, "turn-3")).decision).toBe("confirm");
  });

  test("changed details need a fresh read-back, and say what changed", async () => {
    const gate = new ConfirmationGate();
    await gate.decide(guest, details, "turn-1");
    const changed = { ...details, guests: 3 };
    expect(await gate.decide(guest, changed, "turn-2")).toMatchObject({
      decision: "confirm",
      earlier: { details, changed: ["guests: 2 → 3"] },
    });
    expect((await gate.decide(guest, changed, "turn-3")).decision).toBe("create");
  });

  test("a slightly different call never overwrites the read-back the guest confirmed (seen live)", async () => {
    const gate = new ConfirmationGate();
    await gate.decide(guest, details, "turn-1"); // the read-back
    // The confirming turn: the model's first call differs (it dropped a guest)…
    expect((await gate.decide(guest, { ...details, guests: 1 }, "turn-2")).decision).toBe("confirm");
    // …and repeating what was read back still books, instead of looping.
    expect(await gate.decide(guest, details, "turn-2")).toEqual({ decision: "create" });
  });

  test("a stale read-back expires", async () => {
    let now = 0;
    const gate = new ConfirmationGate({ ttlMs: 1_000, now: () => now });
    await gate.decide(guest, details, "turn-1");
    now = 5_000;
    expect((await gate.decide(guest, details, "turn-2")).decision).toBe("confirm");
  });

  test("one guest's read-back never confirms another guest's booking", async () => {
    const gate = new ConfirmationGate();
    await gate.decide(guest, details, "turn-1");
    expect((await gate.decide("+263700000002", details, "turn-2")).decision).toBe("confirm");
  });
});

describe("changedFields", () => {
  test("names each difference, ignoring casing and order", () => {
    expect(changedFields(details, { ...details, guestName: "EVAL guest", activitySlugs: ["hike", "braai"] })).toEqual([]);
    expect(changedFields(details, { ...details, checkOut: "2041-02-04", activitySlugs: [] })).toEqual([
      "check-out: 2041-02-03 → 2041-02-04",
      "experiences: braai, hike → none",
    ]);
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
