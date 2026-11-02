import type { ChipTone } from "./ui/page";

const QUOTE: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "gold" },
  viewed: { label: "Viewed", tone: "info" },
  accepted: { label: "Accepted", tone: "good" },
  declined: { label: "Declined", tone: "bad" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function quoteChip(status: string): { label: string; tone: ChipTone } {
  return QUOTE[status] ?? { label: status, tone: "neutral" };
}
