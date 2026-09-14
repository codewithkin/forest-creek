import { describe, expect, test } from "bun:test";

import { parseChatId, sessionIdToChatId, sessionIdToPhone } from "./session";

describe("parseChatId", () => {
  test("parses a direct chat id", () => {
    expect(parseChatId("263712345678@c.us")).toEqual({
      phone: "+263712345678",
      sessionId: "whatsapp:263712345678",
      isGroup: false,
      isLid: false,
      chatId: "263712345678@c.us",
    });
  });

  test("parses a LID id as a direct chat without misreading it as a phone", () => {
    expect(parseChatId("57321287889014@lid")).toEqual({
      phone: undefined,
      sessionId: "whatsapp:57321287889014@lid",
      isGroup: false,
      isLid: true,
      chatId: "57321287889014@lid",
    });
  });

  test("flags group chats so they can be ignored", () => {
    const parsed = parseChatId("263712345678@g.us");
    expect(parsed?.isGroup).toBe(true);
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseChatId("  263712345678@c.us  ")?.phone).toBe("+263712345678");
  });

  test("rejects ids that are not a phone or lid chat", () => {
    for (const bad of ["", "status@broadcast", "not-a-chat", "@c.us", "abc@c.us", "@lid", "abc@lid"]) {
      expect(parseChatId(bad)).toBeUndefined();
    }
  });

  test("two messages from one guest map to the same thread", () => {
    const first = parseChatId("263771112222@c.us");
    const second = parseChatId("263771112222@c.us");
    expect(first?.sessionId).toBe(second!.sessionId);
  });

  test("a LID keeps its own thread distinct from any phone", () => {
    expect(parseChatId("57321287889014@lid")?.sessionId).not.toBe(
      parseChatId("263771112222@c.us")?.sessionId,
    );
  });

  test("different guests never share a thread", () => {
    expect(parseChatId("263771112222@c.us")?.sessionId).not.toBe(
      parseChatId("263773334444@c.us")?.sessionId,
    );
  });
});

describe("sessionIdToChatId", () => {
  test("round-trips a phone-based session", () => {
    const parsed = parseChatId("263712345678@c.us")!;
    expect(sessionIdToChatId(parsed.sessionId)).toBe("263712345678@c.us");
  });

  test("round-trips a LID session back to the LID, not a c.us guess", () => {
    const parsed = parseChatId("57321287889014@lid")!;
    expect(sessionIdToChatId(parsed.sessionId)).toBe("57321287889014@lid");
  });

  test("ignores threads that did not come from WhatsApp", () => {
    expect(sessionIdToChatId("8f3a-web-widget-session")).toBeUndefined();
    expect(sessionIdToChatId("whatsapp:not-digits")).toBeUndefined();
  });
});

describe("sessionIdToPhone", () => {
  test("round-trips a parsed phone chat id", () => {
    const parsed = parseChatId("263712345678@c.us")!;
    expect(sessionIdToPhone(parsed.sessionId)).toBe(parsed.phone);
  });

  test("yields no phone for a LID thread", () => {
    const parsed = parseChatId("57321287889014@lid")!;
    expect(sessionIdToPhone(parsed.sessionId)).toBeUndefined();
  });

  test("ignores threads that did not come from WhatsApp", () => {
    expect(sessionIdToPhone("8f3a-web-widget-session")).toBeUndefined();
    expect(sessionIdToPhone("whatsapp:not-digits")).toBeUndefined();
  });
});