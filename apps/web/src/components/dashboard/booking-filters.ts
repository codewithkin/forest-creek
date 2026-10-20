/*
 * The bookings list's tabs. A plain module, not part of the "use client"
 * table, so the server page can validate ?filter= with isFilterKey — a
 * function exported from a client module cannot be called on the server.
 */

// Each tab is a filter the list query understands. "Refunds due" is not a
// payment state, so tabs carry their own query rather than one status value.
// Unpaid bookings hold no room and are not income, so they live in their own
// "Maybe" tab rather than among the stays that are actually booked.
export const filters = [
  { key: "all", label: "Booked", query: { maybe: false } },
  { key: "maybe", label: "Maybe (unpaid)", query: { maybe: true } },
  { key: "partial", label: "Deposit paid", query: { paymentStatus: "partial" } },
  { key: "verified", label: "Paid in full", query: { paymentStatus: "verified" } },
  { key: "rejected", label: "Rejected", query: { paymentStatus: "rejected" } },
  { key: "refunds", label: "Refunds due", query: { refundStatus: "due" } },
  { key: "attention", label: "Needs attention", query: { needsAttention: true } },
] as const;

export type FilterKey = (typeof filters)[number]["key"];

export function isFilterKey(value: unknown): value is FilterKey {
  return filters.some((candidate) => candidate.key === value);
}
