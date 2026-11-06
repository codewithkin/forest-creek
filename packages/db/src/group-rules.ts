// Import-free so it can be unit tested without a database or env.

/** GRP-4K7Q2M: the shared reference of rooms booked together. */
export function groupReference(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index++) code += alphabet[Math.floor(random() * alphabet.length)];
  return `GRP-${code}`;
}

/**
 * Spreads a price agreed for the whole group across its rooms, in proportion
 * to what the calendar would charge each, so the room totals add up to
 * exactly the agreed price. Each room gets a whole-dollar nightly rate and,
 * where that rounds above its share, a discount making up the difference.
 */
export function spreadGroupPrice(
  rooms: readonly { calendarSubtotal: number; nights: number }[],
  agreedTotal: number,
): { rate: number; discount: number; total: number }[] {
  const calendar = rooms.reduce((sum, room) => sum + room.calendarSubtotal, 0);
  let allotted = 0;
  return rooms.map((room, index) => {
    const share =
      index === rooms.length - 1
        ? agreedTotal - allotted
        : Math.round(calendar > 0 ? (agreedTotal * room.calendarSubtotal) / calendar : agreedTotal / rooms.length);
    allotted += share;
    const rate = Math.max(1, Math.ceil(share / room.nights));
    return { rate, discount: rate * room.nights - share, total: share };
  });
}

/**
 * One payment shared across the group's rooms in proportion to their prices,
 * so a group deposit puts money on every room and every room is secured
 * (only money secures a room). Whole dollars; any left over from rounding goes to the
 * first rooms. Refuses more than the group owes.
 */
export function allocatePayment(totals: readonly number[], amount: number): number[] {
  const owed = totals.reduce((sum, total) => sum + total, 0);
  if (amount > owed) throw new Error(`$${amount} is more than the group's $${owed} total`);
  if (owed === 0) return totals.map(() => 0);
  const shares = totals.map((total) => Math.floor((amount * total) / owed));
  let left = amount - shares.reduce((sum, share) => sum + share, 0);
  for (let index = 0; left > 0; index = (index + 1) % totals.length) {
    if (shares[index]! < totals[index]!) {
      shares[index]! += 1;
      left -= 1;
    }
  }
  return shares;
}
