import { describe, expect, test } from "bun:test";

import { createApp } from "./app";

const API_KEY = "test-agent-api-key-0123456789";
const app = createApp({ apiKey: API_KEY });
const authorised = { Authorization: `Bearer ${API_KEY}` };

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

  test("the qr page is the live control page, never cached", async () => {
    const response = await app.request("/whatsapp/qr");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("/whatsapp/state");
    expect(html).toContain("noindex");
  });

  test("send rejects a missing body", async () => {
    const response = await app.request("/whatsapp/send", { method: "POST", headers: authorised });
    expect(response.status).toBe(400);
  });

  test("send rejects a blank message", async () => {
    const response = await app.request("/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorised },
      body: JSON.stringify({ sessionId: "whatsapp:263712345678", content: "   " }),
    });
    expect(response.status).toBe(400);
  });

  test("send refuses a thread that is not a WhatsApp one", async () => {
    const response = await app.request("/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorised },
      body: JSON.stringify({ sessionId: "web-widget-abc", content: "hello" }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      "Not a WhatsApp thread",
    );
  });

  test("send refuses anyone without the API server's key — it sends from the lodge's number", async () => {
    const body = JSON.stringify({ sessionId: "whatsapp:263712345678", content: "hello" });
    const headers = { "Content-Type": "application/json" };
    expect((await app.request("/whatsapp/send", { method: "POST", headers, body })).status).toBe(401);
    const wrong = { ...headers, Authorization: "Bearer not-the-key" };
    expect((await app.request("/whatsapp/send", { method: "POST", headers: wrong, body })).status).toBe(401);
    const unset = createApp({ apiKey: undefined });
    expect((await unset.request("/whatsapp/send", { method: "POST", headers: { ...headers, ...authorised }, body })).status).toBe(503);
  });

  test("send reports unavailable rather than pretending to deliver", async () => {
    const response = await app.request("/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorised },
      body: JSON.stringify({ sessionId: "whatsapp:263712345678", content: "hello" }),
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toContain("not connected");
  });
});

describe("the WhatsApp page's access", () => {
  const PASSWORD = "correct horse battery";
  const locked = createApp({ adminPassword: PASSWORD });
  const open = createApp({ adminPassword: undefined });

  async function signIn(password: string, address = "203.0.113.7") {
    return locked.request("/whatsapp/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "x-forwarded-for": address },
      body: new URLSearchParams({ password }).toString(),
    });
  }

  test("with a password set, the page and its state (the QR) need signing in", async () => {
    const page = await locked.request("/whatsapp/qr");
    expect(await page.text()).toContain("Staff sign in");
    expect((await locked.request("/whatsapp/state")).status).toBe(401);
    expect((await locked.request("/whatsapp/logout", { method: "POST" })).status).toBe(401);
  });

  test("a wrong password is refused; the right one sets a protected cookie", async () => {
    expect((await signIn("guess")).status).toBe(401);
    const response = await signIn(PASSWORD);
    expect(response.status).toBe(303);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("fc_wa_admin=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain(PASSWORD);

    const session = cookie.split(";")[0]!;
    const state = await locked.request("/whatsapp/state", { headers: { cookie: session } });
    expect(state.status).toBe(200);
    const body = (await state.json()) as { state: string; controlsEnabled: boolean };
    expect(body.state).toBe("disabled");
    expect(body.controlsEnabled).toBe(true);
    const page = await locked.request("/whatsapp/qr", { headers: { cookie: session } });
    expect(await page.text()).toContain("Sign out of this page");
  });

  test("a forged cookie does not get in", async () => {
    const state = await locked.request("/whatsapp/state", { headers: { cookie: "fc_wa_admin=0123456789abcdef" } });
    expect(state.status).toBe(401);
  });

  test("guessing is cut off after a few wrong passwords, even the right one then", async () => {
    const address = "198.51.100.23";
    for (let attempt = 0; attempt < 8; attempt++) await signIn("nope", address);
    expect((await signIn(PASSWORD, address)).status).toBe(429);
  });

  test("with no password, the QR stays reachable but logout and restart are refused", async () => {
    expect((await open.request("/whatsapp/state")).status).toBe(200);
    const logout = await open.request("/whatsapp/logout", { method: "POST" });
    expect(logout.status).toBe(403);
    expect(((await logout.json()) as { error: string }).error).toContain("WHATSAPP_ADMIN_PASSWORD");
    expect((await open.request("/whatsapp/restart", { method: "POST" })).status).toBe(403);
  });

  test("a pairing code needs the agent to be waiting for a phone, and a full number", async () => {
    const response = await open.request("/whatsapp/pairing-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "12" }),
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain("country code");
  });
});
