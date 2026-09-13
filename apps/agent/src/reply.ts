import {
  buildGuestContext,
  buildWhatsappInstructions,
  getBookingAgent,
  isConciergeConfigured,
  toConciergeMessages,
  todayInHarare,
} from "@forest-creek/ai";
import { appendChatMessage, getBookingByReference, getChatHistory } from "@forest-creek/db";

import { toWhatsappText } from "./format";
import { collectToolFacts, groundReply } from "./grounding";
import { parseChatId } from "./session";

/** How many past turns to replay. WhatsApp threads run long; the agent does not need all of it. */
const HISTORY_TURNS = 24;

const OFFLINE_REPLY =
  "Thanks for your message. I can't answer automatically right now, but the team at Forest Creek will pick this up — you can also reach them on +263 71 234 5678 or reservations@forestcreeklodge.co.zw.";

const FAILURE_REPLY =
  "Sorry, something went wrong on my side. The team at Forest Creek has your message and will follow up — or call +263 71 234 5678.";

export type IncomingMessage = {
  chatId: string;
  body: string;
};

export type ReplyResult =
  | { handled: false; reason: "not-a-direct-chat" | "empty" }
  | {
      handled: true;
      reply: string;
      sessionId: string;
      degraded: boolean;
      /** Why the model's own text was replaced, when it was. */
      groundingBlocked?: string;
    };

/**
 * Turns one inbound WhatsApp message into a reply, persisting both sides.
 * Deliberately free of whatsapp-web.js so the whole pipeline is testable
 * without launching a browser.
 */
export async function handleIncomingMessage(message: IncomingMessage): Promise<ReplyResult> {
  const chat = parseChatId(message.chatId);
  // Group chats are ignored: consent and identity are murky, and a booking must
  // belong to one guest.
  if (!chat || chat.isGroup) {
    return { handled: false, reason: "not-a-direct-chat" };
  }

  const body = message.body.trim();
  if (body.length === 0) {
    return { handled: false, reason: "empty" };
  }

  // Persist the guest's turn first, so a later failure still leaves the
  // question visible in the staff inbox.
  await appendChatMessage({ sessionId: chat.sessionId, sender: "guest", content: body });

  if (!isConciergeConfigured()) {
    await appendChatMessage({
      sessionId: chat.sessionId,
      sender: "ai",
      content: OFFLINE_REPLY,
    });
    return { handled: true, reply: OFFLINE_REPLY, sessionId: chat.sessionId, degraded: true };
  }

  let reply: string;
  let degraded = false;
  let groundingBlocked: string | undefined;

  try {
    const history = await getChatHistory(chat.sessionId, HISTORY_TURNS);
    const result = await getBookingAgent().generate(toConciergeMessages(history), {
      instructions: buildWhatsappInstructions(todayInHarare()),
      // The guest's number reaches the booking tool here rather than as a tool
      // input, so the model cannot substitute someone else's.
      requestContext: buildGuestContext({ phone: chat.phone, channel: "whatsapp" }),
    });

    // Never send the model's words unchecked: a reference or bank detail must
    // be backed by what the tools actually did.
    const grounded = await groundReply({
      reply: result.text.trim() || FAILURE_REPLY,
      guestPhone: chat.phone,
      guestMessage: body,
      facts: collectToolFacts(result.toolResults),
      lookupReference: async (reference) => {
        const booking = await getBookingByReference(reference);
        return booking ? { guestPhone: booking.guestPhone } : null;
      },
    });

    if (grounded.blocked) {
      groundingBlocked = grounded.reason;
      console.warn(`[agent] replaced an ungrounded reply for ${chat.sessionId}: ${grounded.reason}`);
    }
    degraded = grounded.reply === FAILURE_REPLY;
    // Formatting runs after grounding, and what is persisted is exactly what
    // the guest sees, so the staff inbox never disagrees with their phone.
    reply = toWhatsappText(grounded.reply);
  } catch (error) {
    console.error("[agent] generate failed", error);
    reply = FAILURE_REPLY;
    degraded = true;
  }

  await appendChatMessage({ sessionId: chat.sessionId, sender: "ai", content: reply });
  return { handled: true, reply, sessionId: chat.sessionId, degraded, groundingBlocked };
}
