import { describe, expect, test } from "bun:test";

import { createApp } from "./app";

const app = createApp();

describe("agent http surface", () => {
  test("root is a plain OK for uptime checks", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  test("health reports both dependencies", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      whatsapp: string;
      concierge: string;
      messagesHandled: number;
    };
    // WHATSAPP_ENABLED=false in tests, so the client never starts.
    expect(body.whatsapp).toBe("disabled");
    expect(["configured", "unconfigured"]).toContain(body.concierge);
    expect(typeof body.messagesHandled).toBe("number");
  });

  test("status does not leak the QR payload itself", async () => {
    const response = await app.request("/whatsapp/status");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("qrDataUrl");
    expect(typeof body.hasQr).toBe("boolean");
  });

  test("qr page says there is nothing to scan while disconnected", async () => {
    const response = await app.request("/whatsapp/qr");
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("Nothing to scan");
  });

  test("send rejects a missing body", async () => {
    const response = await app.request("/whatsapp/send", { method: "POST" });
    expect(response.status).toBe(400);
  });

  test("send rejects a blank message", async () => {
    const response = await app.request("/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "whatsapp:263712345678", content: "   " }),
    });
    expect(response.status).toBe(400);
  });

  test("send refuses a thread that is not a WhatsApp one", async () => {
    const response = await app.request("/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "web-widget-abc", content: "hello" }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      "Not a WhatsApp thread",
    );
  });

  test("send reports unavailable rather than pretending to deliver", async () => {
    const response = await app.request("/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "whatsapp:263712345678", content: "hello" }),
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toContain("not connected");
  });
});
