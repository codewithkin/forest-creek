/**
 * Import-free, so it can be unit tested without the validated environment.
 */

export type BookingDetails = {
  propertySlug: string;
  roomTier: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestEmail: string;
  activitySlugs: string[];
  paymentMethod: string;
};

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** The same booking typed twice with different casing or order is the same booking. */
export function bookingDetailsKey(details: BookingDetails): string {
  return JSON.stringify([
    normalise(details.propertySlug),
    normalise(details.roomTier),
    details.checkIn,
    details.checkOut,
    details.guests,
    normalise(details.guestName),
    normalise(details.guestEmail),
    details.activitySlugs.map(normalise).sort(),
    details.paymentMethod,
  ]);
}

type Pending = { key: string; turnId: string; expiresAt: number };

/**
 * Makes "the guest confirmed the read-back" something the tool checks, not a
 * rule the model is trusted to follow. Prompt rules alone failed in two eval
 * runs: the WhatsApp agent created the booking in the same turn it collected
 * the details, then told the guest the room it had just taken was unavailable.
 *
 * The first create-booking call for a set of details only records them. The
 * booking is made when the same guest asks for the same details again in a
 * later turn — that is, after they have replied to the read-back.
 */
export class ConfirmationGate {
  readonly #pending = new Map<string, Pending>();
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? 30 * 60_000;
    this.#now = options.now ?? Date.now;
  }

  decide(guest: string, key: string, turnId: string): "create" | "confirm" {
    const now = this.#now();
    const pending = this.#pending.get(guest);
    const live = pending && pending.expiresAt > now && pending.key === key ? pending : undefined;

    if (live && live.turnId !== turnId) {
      // Consumed, so a repeated call can never book the same stay twice.
      this.#pending.delete(guest);
      return "create";
    }
    if (!live) this.#pending.set(guest, { key, turnId, expiresAt: now + this.#ttlMs });
    return "confirm";
  }
}
