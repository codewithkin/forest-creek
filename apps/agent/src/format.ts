/**
 * Models write Markdown; WhatsApp has its own, smaller syntax (*bold*,
 * _italic_) and shows everything else literally. Converting here is
 * deterministic, where asking the model to stop using Markdown was not.
 */
export function toWhatsappText(text: string): string {
  return (
    text
      // **bold** and __bold__ -> *bold*
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/__(.+?)__/g, "*$1*")
      // Headings have no WhatsApp equivalent.
      .replace(/^#{1,6}\s+/gm, "")
      // [label](url) -> label: url, since WhatsApp only links bare URLs.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
