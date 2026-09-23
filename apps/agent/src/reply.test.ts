import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { isConciergeConfigured } from "@forest-creek/ai";
import { brand } from "@forest-creek/ai/brand";
import { getChatHistory, prisma } from "@forest-creek/db";

import { handleIncomingMessage } from "./reply";

const PHONE = "263700000009";
const CHAT_ID = `${PHONE}@c.us`;
const SESSION_ID = `whatsapp:${PHONE}`;
const LID = "57321287889014@lid";
const LID_SESSION_ID = `whatsapp:57321287889014@lid`;

async function cleanup() {
  await prisma.chatMessage.deleteMany({ where: { sessionId: { startsWith: "whatsapp:2637000000" } } });
  await prisma.chatMessage.deleteMany({ where: { sessionId: LID_SESSION_ID } });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("handleIncomingMessage", () => {
  test("ignores group chats", async () => {
    const result = await handleIncomingMessage({
      chatId: `${PHONE}@g.us`,
      body: "anyone want to book?",
    });
    expect(result).toEqual({ handled: false, reason: "not-a-direct-chat" });
  });

  test("ignores anything that is not a phone chat", async () => {
    const result = await handleIncomingMessage({ chatId: "status@broadcast", body: "hi" });
    expect(result).toEqual({ handled: false, reason: "not-a-direct-chat" });
  });

  test("ignores an empty message without touching the thread", async () => {
    const result = await handleIncomingMessage({ chatId: CHAT_ID, body: "   " });
    expect(result).toEqual({ handled: false, reason: "empty" });
    expect(await getChatHistory(SESSION_ID)).toHaveLength(0);
  });

  test("persists the guest turn and answers", async () => {
    const result = await handleIncomingMessage({
      chatId: CHAT_ID,
      body: "Hi, do you have a family room in June?",
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.reply.length).toBeGreaterThan(0);

    const history = await getChatHistory(SESSION_ID);
    expect(history).toHaveLength(2);
    expect(history[0]?.sender).toBe("guest");
    expect(history[0]?.content).toBe("Hi, do you have a family room in June?");
    expect(history[1]?.sender).toBe("ai");
    expect(history[1]?.content).toBe(result.reply);
  });

  test("keeps one thread per guest across messages", async () => {
    await handleIncomingMessage({ chatId: CHAT_ID, body: "Second question" });

    const history = await getChatHistory(SESSION_ID);
    expect(history.length).toBe(4);
    // Oldest first, so the transcript replays in order.
    expect(history.map((message) => message.sender)).toEqual(["guest", "ai", "guest", "ai"]);
  });

  test("different guests get separate threads", async () => {
    const other = "263700000008";
    await handleIncomingMessage({ chatId: `${other}@c.us`, body: "Hello from someone else" });

    const mine = await getChatHistory(SESSION_ID);
    const theirs = await getChatHistory(`whatsapp:${other}`);
    expect(theirs).toHaveLength(2);
    expect(mine.length).toBe(4);
  });

  test("treats a LID id as a direct chat, not a group or unknown", async () => {
    const result = await handleIncomingMessage({ chatId: LID, body: "Can you help me book?" });
    expect(result.handled).toBe(true);
    if (!result.handled) return;
    expect(result.sessionId).toBe(LID_SESSION_ID);

    // The question lands in the guest's own thread, keyed by the LID.
    const history = await getChatHistory(LID_SESSION_ID);
    expect(history.at(-2)?.content).toBe("Can you help me book?");
  });

  test("degrades to a hand-off when the model is unconfigured", async () => {
    // The suite runs without OPENROUTER_API_KEY, so this is the live path.
    if (isConciergeConfigured()) return;

    const result = await handleIncomingMessage({ chatId: CHAT_ID, body: "Are you there?" });
    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.degraded).toBe(true);
    // A guest must still be given a way to reach a human.
    expect(result.reply).toContain(brand.reservationsPhone);

    // And the question is still in the inbox for staff to pick up.
    const history = await getChatHistory(SESSION_ID);
    expect(history.at(-2)?.content).toBe("Are you there?");
  });
});
