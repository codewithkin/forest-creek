import {
  buildFactualReply,
  collectToolFacts,
  groundReply,
  isConciergeConfigured,
  runBookingAgent,
  toConciergeMessages,
  todayInHarare,
  type AgentRun,
  type ToolFacts,
} from "@forest-creek/ai";
import { appendChatMessage, getBookingByReference, getChatHistory } from "@forest-creek/db";

import { toWhatsappText } from "./format";
import { parseChatId } from "./session";

/** How many past turns to replay. WhatsApp threads run long; the agent does not need all of it. */
const HISTORY_TURNS = 24;

const OFFLINE_REPLY =
  "Thanks for your message. I can't answer automatically right now, but the team at Forest Creek will pick this up — you can also reach them on +263 71 234 5678 or reservations@forestcreeklodge.co.zw.";

export const FAILURE_REPLY =
  "Sorry, something went wrong on my side. The team at Forest Creek has your message and will follow up — or call +263 71 234 5678.";

export type IncomingMessage = {
  chatId: string;
  body: string;
};

/** What the model run looked like, for logs and evals. Never sent to the guest. */
export type RunSummary = Pick<AgentRun, "modelId" | "provider" | "toolsCalled" | "latencyMs"> & {
  costUsd: number | undefined;
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
      run?: RunSummary;
    };

/**
 * The text to ground and send. An empty model reply after real work must still
 * tell the guest what happened: in one eval run the agent booked the stay and
 * issued the payment request, ran out of steps before writing a word, and the
 * guest was told something had gone wrong.
 */
export function draftReply(text: string, facts: ToolFacts): string {
  if (text) return text;
  const didSomething = facts.bookings.length > 0 || facts.payments.length > 0;
  return didSomething ? buildFactualReply(facts) : FAILURE_REPLY;
}

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
  console.log(`[agent] ${chat.sessionId}: stored guest message (${body.length} chars)`);

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
  let run: RunSummary | undefined;

  try {
    const history = await getChatHistory(chat.sessionId, HISTORY_TURNS);
    // The guest's number reaches the booking tool through the request context
    // rather than as a tool input, so the model cannot substitute someone else's.
    console.log(`[agent] ${chat.sessionId}: generating with booking agent (${history.length} history msgs)`);
    const agentRun = await runBookingAgent(toConciergeMessages(history), {
      today: todayInHarare(),
      guestPhone: chat.phone,
      channel: "whatsapp",
    });
    run = {
      modelId: agentRun.modelId,
      provider: agentRun.provider,
      toolsCalled: agentRun.toolsCalled,
      latencyMs: agentRun.latencyMs,
      costUsd: agentRun.usage.costUsd,
    };
    console.log(
      `[agent] ${chat.sessionId}: generation done — model=${agentRun.modelId} provider=${agentRun.provider} ` +
        `tools=[${agentRun.toolsCalled.join(", ")}] latency=${agentRun.latencyMs}ms cost=$${(
          agentRun.usage.costUsd ?? 0
        ).toFixed(4)}`,
    );

    // Never send the model's words unchecked: a reference or bank detail must
    // be backed by what the tools actually did.
    const facts = collectToolFacts(agentRun.toolResults);
    const grounded = await groundReply({
      reply: draftReply(agentRun.text, facts),
      guestPhone: chat.phone,
      guestMessage: body,
      facts,
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
  console.log(`[agent] ${chat.sessionId}: reply stored (${reply.length} chars)`);
  return { handled: true, reply, sessionId: chat.sessionId, degraded, groundingBlocked, run };
}
