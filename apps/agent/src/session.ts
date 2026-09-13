/**
 * A WhatsApp chat id looks like "263712345678@c.us" (or "...@g.us" for groups).
 * Threads are keyed by phone number so the staff inbox shows one conversation
 * per guest, and so a guest keeps their history across messages.
 */
const CHAT_ID = /^(\d{6,20})@(c|s\.whatsapp\.net|g)\.?(us)?$/i;

export const SESSION_PREFIX = "whatsapp:";

export type ParsedChat = {
  phone: string;
  sessionId: string;
  isGroup: boolean;
};

export function parseChatId(chatId: string): ParsedChat | undefined {
  const match = CHAT_ID.exec(chatId.trim());
  if (!match) return undefined;

  const phone = match[1]!;
  return {
    phone: "+" + phone,
    sessionId: SESSION_PREFIX + phone,
    isGroup: match[2]!.toLowerCase() === "g",
  };
}

export function sessionIdToPhone(sessionId: string): string | undefined {
  if (!sessionId.startsWith(SESSION_PREFIX)) return undefined;
  const digits = sessionId.slice(SESSION_PREFIX.length);
  return /^\d{6,20}$/.test(digits) ? "+" + digits : undefined;
}
