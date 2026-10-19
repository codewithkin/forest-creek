import type { ChatMessage } from "@forest-creek/db";

import type { PhotoToSend } from "./photos";

export type ConciergeMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

/**
 * How the WhatsApp agent records photos it sent (apps/agent photoNote), so
 * staff see them in the inbox and the next turn knows where "more" carries on.
 */
export const PHOTO_NOTE_PREFIX = "📷 Sent ";

/**
 * Staff replies are replayed as assistant turns with a [Staff] marker. Without
 * it the agent reads a staff member's words as its own and starts speaking for the
 * lodge — promising things no one authorised.
 *
 * Photo notes are replayed as a bracketed record rather than as something the
 * assistant said: replayed verbatim, the model copied "📷 Sent 1 photo: …"
 * into its next reply to the guest.
 */
export function toConciergeMessages(history: ChatMessage[]): ConciergeMessage[] {
  return history.map((message) => {
    if (message.sender === "guest") {
      return { role: "user" as const, content: message.content };
    }
    if (message.sender === "admin") {
      return { role: "assistant" as const, content: "[Staff] " + message.content };
    }
    if (message.content.startsWith(PHOTO_NOTE_PREFIX)) {
      return {
        role: "assistant" as const,
        content: `[Photos already sent: ${message.content.slice(PHOTO_NOTE_PREFIX.length).replace(/^\d+ photos?:\s*/, "")}]`,
      };
    }
    return { role: "assistant" as const, content: message.content };
  });
}

const PHOTO_NOTES = [/\[Photos already sent:[^\]]*\]/g, /📷\s*Sent\b[^\n]*/gu];

/** Takes any photo record the model copied out of the history back out of its reply. */
export function stripPhotoNotes(reply: string): string {
  let text = reply;
  for (const pattern of PHOTO_NOTES) text = text.replace(pattern, "");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The line saved to the thread after photos go out. Staff see what the guest
 * was shown, and the agent reads it next turn to know where "more" carries on.
 */
export function photoNote(photos: PhotoToSend[]): string | undefined {
  if (photos.length === 0) return undefined;
  const bySubject = new Map<string, PhotoToSend[]>();
  for (const photo of photos) bySubject.set(photo.subject, [...(bySubject.get(photo.subject) ?? []), photo]);
  const parts = [...bySubject.entries()].map(([subject, group]) => {
    const first = group[0]!.number;
    const last = group[group.length - 1]!.number;
    const total = group[0]!.total;
    const range = first === last ? `photo ${first}` : `photos ${first}–${last}`;
    return `${subject} (${range} of ${total})`;
  });
  return `${PHOTO_NOTE_PREFIX}${photos.length === 1 ? "1 photo" : `${photos.length} photos`}: ${parts.join("; ")}`;
}
