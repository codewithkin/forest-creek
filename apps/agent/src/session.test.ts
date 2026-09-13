import { describe, expect, test } from "bun:test";

import { parseChatId, sessionIdToPhone } from "./session";

describe("parseChatId", () => {
  test("parses a direct chat id", () => {
    expect(parseChatId("263712345678@c.us")).toEqual({
      phone: "+263712345678",
      sessionId: "whatsapp:263712345678",
      isGroup: false,
    });
  });

  test("flags group chats so they can be ignored", () => {
    const parsed = parseChatId("263712345678@g.us");
    expect(parsed?.isGroup).toBe(true);
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseChatId("  263712345678@c.us  ")?.phone).toBe("+263712345678");
  });

  test("rejects ids that are not a phone chat", () => {
    for (const bad of ["", "status@broadcast", "not-a-chat", "@c.us", "abc@c.us"]) {
      expect(parseChatId(bad)).toBeUndefined();
    }
  });

  test("two messages from one guest map to the same thread", () => {
    const first = parseChatId("263771112222@c.us");
    const second = parseChatId("263771112222@c.us");
    expect(first?.sessionId).toBe(second!.sessionId);
  });

  test("different guests never share a thread", () => {
    expect(parseChatId("263771112222@c.us")?.sessionId).not.toBe(
      parseChatId("263773334444@c.us")?.sessionId,
    );
  });
});

describe("sessionIdToPhone", () => {
  test("round-trips a parsed chat id", () => {
    const parsed = parseChatId("263712345678@c.us")!;
    expect(sessionIdToPhone(parsed.sessionId)).toBe(parsed.phone);
  });

  test("ignores threads that did not come from WhatsApp", () => {
    expect(sessionIdToPhone("8f3a-web-widget-session")).toBeUndefined();
    expect(sessionIdToPhone("whatsapp:not-digits")).toBeUndefined();
  });
});
