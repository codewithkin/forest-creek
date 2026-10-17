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

const LABELS: Record<keyof BookingDetails, string> = {
  propertySlug: "property",
  roomTier: "room",
  checkIn: "check-in",
  checkOut: "check-out",
  guests: "guests",
  guestName: "name",
  guestEmail: "email",
  activitySlugs: "experiences",
  paymentMethod: "payment method",
};

/** What differs between two sets of details, e.g. "guests: 2 → 1". */
export function changedFields(before: BookingDetails, after: BookingDetails): string[] {
  const shown = (value: unknown) =>
    Array.isArray(value) ? value.map(String).map(normalise).sort().join(", ") || "none" : normalise(String(value));
  return (Object.keys(LABELS) as (keyof BookingDetails)[])
    .filter((field) => shown(before[field]) !== shown(after[field]))
    .map((field) => `${LABELS[field]}: ${shown(before[field])} → ${shown(after[field])}`);
}

export type PendingConfirmation = { key: string; turnId: string; details: BookingDetails; expiresAt: number };

/** Where read-backs wait. The WhatsApp agent keeps them in Postgres so a redeploy cannot lose one. */
export type ConfirmationStore = {
  /** The guest's read-backs that have not expired by `now`, oldest first. */
  list(guest: string, now: number): Promise<PendingConfirmation[]>;
  /** Records one; the same details again keep their original turn. */
  add(guest: string, pending: PendingConfirmation): Promise<void>;
  clear(guest: string): Promise<void>;
};

export class MemoryConfirmationStore implements ConfirmationStore {
  readonly #pending = new Map<string, PendingConfirmation[]>();

  async list(guest: string, now: number) {
    const live = (this.#pending.get(guest) ?? []).filter((pending) => pending.expiresAt > now);
    this.#pending.set(guest, live);
    return live;
  }

  async add(guest: string, pending: PendingConfirmation) {
    const all = this.#pending.get(guest) ?? [];
    const existing = all.find((candidate) => candidate.key === pending.key);
    if (existing) existing.expiresAt = pending.expiresAt;
    else all.push(pending);
    this.#pending.set(guest, all);
  }

  async clear(guest: string) {
    this.#pending.delete(guest);
  }
}

export type GateDecision =
  | { decision: "create" }
  | {
      decision: "confirm";
      /** These exact details were already read back in this same turn — stop and wait for the guest. */
      askedThisTurn: boolean;
      /** The guest's earlier read-back, when these details differ from it. */
      earlier?: { details: BookingDetails; changed: string[] };
    };

/**
 * Makes "the guest confirmed the read-back" something the tool checks, not a
 * rule the model is trusted to follow. Prompt rules alone failed in two eval
 * runs: the WhatsApp agent created the booking in the same turn it collected
 * the details, then told the guest the room it had just taken was unavailable.
 *
 * The first create-booking call for a set of details only records them. The
 * booking is made when the same guest asks for the same details again in a
 * later turn — that is, after they have replied to the read-back.
 *
 * A call with different details never replaces an earlier read-back: live, the
 * model's "Confirm" call differed slightly from what it had read back, each
 * retry overwrote the last, four calls booked nothing, and it invented a
 * reference. Now the earlier read-back stays, the call is told what changed,
 * and repeating the earlier details books.
 */
export class ConfirmationGate {
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #store: ConfirmationStore;

  constructor(options: { ttlMs?: number; now?: () => number; store?: ConfirmationStore } = {}) {
    this.#ttlMs = options.ttlMs ?? 30 * 60_000;
    this.#now = options.now ?? Date.now;
    this.#store = options.store ?? new MemoryConfirmationStore();
  }

  async decide(guest: string, details: BookingDetails, turnId: string): Promise<GateDecision> {
    const now = this.#now();
    const key = bookingDetailsKey(details);
    const pending = await this.#store.list(guest, now);
    const same = pending.find((candidate) => candidate.key === key);

    if (same && same.turnId !== turnId) {
      // Consumed, with every other read-back, so nothing can be booked twice.
      await this.#store.clear(guest);
      return { decision: "create" };
    }
    if (!same) await this.#store.add(guest, { key, turnId, details, expiresAt: now + this.#ttlMs });

    const earlier = [...pending].reverse().find((candidate) => candidate.key !== key && candidate.turnId !== turnId);
    return {
      decision: "confirm",
      askedThisTurn: Boolean(same),
      ...(earlier ? { earlier: { details: earlier.details, changed: changedFields(earlier.details, details) } } : {}),
    };
  }
}
