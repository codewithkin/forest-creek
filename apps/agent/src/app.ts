import { isConciergeConfigured } from "@forest-creek/ai";
import { env } from "@forest-creek/env/server";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  adminToken,
  cookieAuthorizes,
  createLoginLimiter,
  passwordMatches,
} from "./admin-auth";
import { controlPage, loginPage } from "./qr-page";
import { sessionIdToChatId } from "./session";
import {
  getStatus,
  getStoredSession,
  logoutWhatsapp,
  requestPairingCode,
  restartWhatsapp,
  sendToGuest,
} from "./whatsapp";

/** The last X-Forwarded-For hop (what Coolify's proxy appends), else a fixed key. */
function clientAddress(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || "direct";
}

export function createApp(options: { adminPassword?: string } = {}) {
  const app = new Hono();
  const password = "adminPassword" in options ? options.adminPassword : env.WHATSAPP_ADMIN_PASSWORD;
  const logins = createLoginLimiter();

  const signedIn = (c: Context) => Boolean(password) && cookieAuthorizes(getCookie(c, ADMIN_COOKIE), password!);
  /** With no password configured the page stays open, as it always was. */
  const mayView = (c: Context) => !password || signedIn(c);
  /** Logout and restart only ever behind a password. */
  const mayControl = (c: Context) => Boolean(password) && signedIn(c);

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

  /**
   * The agent's main page: link the lodge phone, see that it is linked, log
   * it out or restart it. Polls /whatsapp/state, so the QR is always current.
   */
  app.get("/whatsapp/qr", (c) => {
    c.header("Cache-Control", "no-store");
    if (!mayView(c)) return c.html(loginPage());
    return c.html(controlPage({ controlsEnabled: Boolean(password), signedIn: signedIn(c) }));
  });

  app.post("/whatsapp/login", async (c) => {
    if (!password) return c.redirect("/whatsapp/qr", 303);
    const address = clientAddress(c);
    if (logins.blocked(address)) {
      return c.html(loginPage("Too many wrong passwords. Try again in 15 minutes."), 429);
    }
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const given = typeof form.password === "string" ? form.password : "";
    if (!passwordMatches(given, password)) {
      logins.fail(address);
      return c.html(loginPage("That password is not right."), 401);
    }
    logins.succeed(address);
    setCookie(c, ADMIN_COOKIE, adminToken(password), {
      httpOnly: true,
      sameSite: "Strict",
      secure: new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https",
      path: "/whatsapp",
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });
    return c.redirect("/whatsapp/qr", 303);
  });

  app.post("/whatsapp/signout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/whatsapp" });
    return c.redirect("/whatsapp/qr", 303);
  });

  /** Everything the page shows, including the QR itself — so behind the same check as the page. */
  app.get("/whatsapp/state", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!mayView(c)) return c.json({ error: "Sign in first" }, 401);
    const stored = await getStoredSession();
    const status = getStatus();
    return c.json({
      ...status,
      // By the agent's clock, so a viewer whose clock is off still sees the truth.
      qrSecondsLeft: status.qrExpiresAt ? Math.max(0, Math.round((Date.parse(status.qrExpiresAt) - Date.now()) / 1000)) : null,
      session: stored ? { sizeBytes: stored.sizeBytes, updatedAt: stored.updatedAt.toISOString() } : null,
      controlsEnabled: Boolean(password),
    });
  });

  const guardControl = (c: Context) => {
    if (!password) {
      return c.json({ error: "Set WHATSAPP_ADMIN_PASSWORD on the agent to enable this." }, 403);
    }
    if (!mayControl(c)) return c.json({ error: "Sign in first" }, 401);
    return undefined;
  };

  /** Unlinks the device from the phone and deletes the saved session; a new QR follows. */
  app.post("/whatsapp/logout", async (c) => {
    const refused = guardControl(c);
    if (refused) return refused;
    const result = await logoutWhatsapp();
    return c.json({ loggedOut: true, ...result });
  });

  /** Reconnects, keeping the saved session. */
  app.post("/whatsapp/restart", async (c) => {
    const refused = guardControl(c);
    if (refused) return refused;
    await restartWhatsapp();
    return c.json({ restarting: true });
  });

  /** "Link with phone number instead": a code for phones that cannot scan the QR. */
  app.post("/whatsapp/pairing-code", async (c) => {
    if (!mayView(c)) return c.json({ error: "Sign in first" }, 401);
    const body = (await c.req.json().catch(() => undefined)) as { phone?: unknown } | undefined;
    const phone = typeof body?.phone === "string" ? body.phone : "";
    try {
      return c.json({ code: await requestPairingCode(phone) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not get a code" }, 409);
    }
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
