/**
 * A WhatsApp chat id is "263712345678@c.us" (phone-based), "57321287889014@lid" for a
 * Linked ID — WhatsApp's obfuscated identity for contacts the device doesn't know, whose
 * digits are NOT a phone number — or "...@g.us" for groups.
 * Threads are keyed by a stable per-contact id so the staff inbox shows one conversation
 * per guest, and so a guest keeps their history across messages.
 */
const SESSION_PREFIX = "whatsapp:";

const PHONE_CHAT = /^(\d{6,20})@(c\.us|s\.whatsapp\.net)$/i;
const LID_CHAT = /^(\d{6,20})@lid$/i;
const GROUP_CHAT = /^(\d{6,20})@g\.us$/i;

const PHONE_SESSION = /^whatsapp:(\d{6,20})$/;
const LID_SESSION = /^whatsapp:(\d{6,20})@lid$/;

export type ParsedChat = {
  /** Real phone with a leading +; present only for phone-based ids, absent for LIDs. */
  phone?: string;
  sessionId: string;
  isGroup: boolean;
  isLid: boolean;
  /** Full serialized id to reply to, e.g. "263712345678@c.us" or "57321287889014@lid". */
  chatId: string;
};

export function parseChatId(chatId: string): ParsedChat | undefined {
  const raw = chatId.trim();

  let match = PHONE_CHAT.exec(raw);
  if (match) {
    const digits = match[1]!;
    return {
      phone: `+${digits}`,
      sessionId: `${SESSION_PREFIX}${digits}`,
      isGroup: false,
      isLid: false,
      chatId: raw,
    };
  }

  match = LID_CHAT.exec(raw);
  if (match) {
    const digits = match[1]!;
    return {
      sessionId: `${SESSION_PREFIX}${digits}@lid`,
      isGroup: false,
      isLid: true,
      chatId: raw,
    };
  }

  match = GROUP_CHAT.exec(raw);
  if (match) {
    const digits = match[1]!;
    return {
      sessionId: `${SESSION_PREFIX}${digits}@g`,
      isGroup: true,
      isLid: false,
      chatId: raw,
    };
  }

  return undefined;
}

/**
 * The full WhatsApp id a reply must be sent to. Phone-based sessions reply to the phone;
 * LID sessions reply to the LID itself, never to a LID-digits-as-phone "@c.us" guess.
 */
export function sessionIdToChatId(sessionId: string): string | undefined {
  const lid = LID_SESSION.exec(sessionId);
  if (lid) return `${lid[1]}@lid`;

  const phone = PHONE_SESSION.exec(sessionId);
  if (phone) return `${phone[1]}@c.us`;

  return undefined;
}

/** Phone with a leading + for phone-based sessions; undefined for LID sessions. */
export function sessionIdToPhone(sessionId: string): string | undefined {
  const phone = PHONE_SESSION.exec(sessionId);
  return phone ? `+${phone[1]}` : undefined;
}