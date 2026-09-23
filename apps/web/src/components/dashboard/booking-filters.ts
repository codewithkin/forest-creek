/*
 * The bookings list's tabs. A plain module, not part of the "use client"
 * table, so the server page can validate ?filter= with isFilterKey — a
 * function exported from a client module cannot be called on the server.
 */

// Each tab is a filter the list query understands. "Refunds due" is not a
// payment state, so tabs carry their own query rather than one status value.
export const filters = [
  { key: "all", label: "All", query: {} },
  { key: "pending", label: "Awaiting payment", query: { paymentStatus: "pending" } },
  { key: "processing", label: "Charge sent", query: { paymentStatus: "processing" } },
  { key: "verified", label: "Paid", query: { paymentStatus: "verified" } },
  { key: "rejected", label: "Rejected", query: { paymentStatus: "rejected" } },
  { key: "refunds", label: "Refunds due", query: { refundStatus: "due" } },
  { key: "attention", label: "Needs attention", query: { needsAttention: true } },
] as const;

export type FilterKey = (typeof filters)[number]["key"];

export function isFilterKey(value: unknown): value is FilterKey {
  return filters.some((candidate) => candidate.key === value);
}
