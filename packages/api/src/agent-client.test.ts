import { describe, expect, test } from "bun:test";

import { AgentDeliveryError, deliverWhatsappReply, isWhatsappSession } from "./agent-client";

const config = { url: "http://agent:3002", apiKey: "shared-secret-0123456789" };
const input = { sessionId: "whatsapp:263771234567", content: "We have a room free." };

async function failure(promise: Promise<unknown>): Promise<AgentDeliveryError> {
  return promise.then(
    () => { throw new Error("expected a failure"); },
    (error: AgentDeliveryError) => error,
  );
}

describe("deliverWhatsappReply", () => {
  test("posts the reply to the agent with the shared key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ sent: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await deliverWhatsappReply(input, config, fake);
    expect(calls[0]!.url).toBe("http://agent:3002/whatsapp/send");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${config.apiKey}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(input);
  });

  test("says what to set when it is not configured", async () => {
    const error = await failure(deliverWhatsappReply(input, { url: config.url }));
    expect(error.code).toBe("NOT_CONFIGURED");
    expect(error.message).toContain("AGENT_API_KEY");
  });

  test("an unreachable agent is said plainly", async () => {
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect((await failure(deliverWhatsappReply(input, config, down))).code).toBe("UNREACHABLE");
  });

  test("the agent's own reason reaches staff, and a key mismatch is named", async () => {
    const notConnected = (async () =>
      new Response(JSON.stringify({ error: "WhatsApp is not connected (state: qr)" }), { status: 503 })) as unknown as typeof fetch;
    expect((await failure(deliverWhatsappReply(input, config, notConnected))).message).toContain("not connected");
    const wrongKey = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect((await failure(deliverWhatsappReply(input, config, wrongKey))).message).toContain("must match");
  });

  test("only WhatsApp threads go to the agent", () => {
    expect(isWhatsappSession("whatsapp:263771234567")).toBe(true);
    expect(isWhatsappSession("whatsapp:123456789@lid")).toBe(true);
    expect(isWhatsappSession("web-3f2a")).toBe(false);
  });
});
