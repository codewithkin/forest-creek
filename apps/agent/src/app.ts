import { isConciergeConfigured } from "@forest-creek/ai";
import { env } from "@forest-creek/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { sessionIdToChatId } from "./session";
import { getStatus, sendToGuest } from "./whatsapp";

export function createApp() {
  const app = new Hono();

  app.use(logger());
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.get("/", (c) => c.text("OK"));

  /** Liveness for the container. Only a hard failure is unhealthy — waiting for
   * a QR scan is a normal state, not a crash loop. */
  app.get("/health", (c) => {
    const status = getStatus();
    const healthy = status.state !== "failed";
    return c.json(
      {
        healthy,
        whatsapp: status.state,
        concierge: isConciergeConfigured() ? "configured" : "unconfigured",
        messagesHandled: status.messagesHandled,
        startedAt: status.startedAt,
      },
      healthy ? 200 : 503,
    );
  });

  app.get("/whatsapp/status", (c) => {
    const { qrDataUrl, ...rest } = getStatus();
    return c.json({ ...rest, hasQr: Boolean(qrDataUrl) });
  });

  /** Staff open this in a browser to pair the lodge's phone. */
  app.get("/whatsapp/qr", (c) => {
    const status = getStatus();
    if (!status.qrDataUrl) {
      return c.html(
        page("Nothing to scan", `<p style="opacity:.7">State: ${status.state}</p>`),
        status.state === "ready" ? 200 : 409,
      );
    }
    return c.html(
      page(
        "Scan with the lodge phone",
        `<img src="${status.qrDataUrl}" alt="WhatsApp pairing QR" width="320" height="320"
              style="background:#fff;padding:12px;border-radius:12px">
         <p style="opacity:.7">WhatsApp &rarr; Linked devices &rarr; Link a device</p>`,
      ),
    );
  });

  /**
   * Delivers a staff reply to a WhatsApp thread. The message itself is
   * persisted by the dashboard through chat.reply; this only sends it.
   */
  app.post("/whatsapp/send", async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as
      | { sessionId?: unknown; content?: unknown }
      | undefined;

    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!sessionId || content.length === 0) {
      return c.json({ error: "sessionId and content are required" }, 400);
    }

    // LID threads reply to the LID itself; sessionIdToChatId returns the exact
    // serialized id, never a ".@c.us" guess built from LID digits.
    const chatId = sessionIdToChatId(sessionId);
    if (!chatId) {
      return c.json({ error: `Not a WhatsApp thread: ${sessionId}` }, 400);
    }

    try {
      await sendToGuest(chatId, content);
      return c.json({ sent: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "send failed" }, 503);
    }
  });

  return app;
}

function page(heading: string, inner: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${heading}</title>
    <body style="font-family:system-ui;background:#0b2420;color:#f2f7f5;display:grid;place-items:center;height:100vh;margin:0">
      <div style="text-align:center"><h1 style="font-weight:400">${heading}</h1>${inner}</div>
    </body>`;
}
