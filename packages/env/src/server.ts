import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    // Required on the API server (packages/auth mounts better-auth, which needs both). The
    // WhatsApp agent never imports auth, so they stay optional here and packages/auth throws
    // at startup if they're missing.
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.url().optional(),
    // Shared cookie domain for the web + API hosts (e.g. ".christusveritastech.co.zw").
    // Without it the session cookie is host-only for the API, so the web's server-side
    // session check never sees it and /dashboard redirect-loops. packages/auth derives
    // it from BETTER_AUTH_URL when omitted; leave unset for localhost.
    COOKIE_DOMAIN: z.string().min(1).optional(),
    CORS_ORIGIN: z.url(),
    // The API's public address (e.g. https://api.forestcreek.co.zw), where
    // Paynow POSTs payment results. Falls back to BETTER_AUTH_URL, which the API
    // server always has; the WhatsApp agent must set it for its charges to be
    // confirmed by callback rather than by polling alone.
    SERVER_URL: z.url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z
      .string()
      .min(1)
      .default("openrouter/deepseek/deepseek-v3.2"),
    // Cloudflare R2. All optional so the app boots without it; uploads report
    // themselves as unconfigured rather than crashing the server.
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_PUBLIC_URL: z.string().min(1).optional(),
    // Paynow (mobile money — EcoCash/OneMoney only). Optional so the app boots
    // without it; the payment tools report themselves unconfigured rather than
    // crashing, same as R2 above.
    PAYNOW_INTEGRATION_ID: z.string().min(1).optional(),
    PAYNOW_INTEGRATION_KEY: z.string().min(1).optional(),
    // Outgoing email (packages/mail) for booking notifications. Optional: with
    // no SMTP_HOST, queued emails are marked skipped and nothing else changes.
    // 465 means implicit TLS; anything else upgrades with STARTTLS.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    // e.g. "Forest Creek <admin@forestcreek.co.zw>"; defaults to SMTP_USER.
    SMTP_FROM: z.string().min(1).optional(),
    // WhatsApp agent (apps/agent)
    AGENT_PORT: z.coerce.number().int().positive().default(3002),
    // whatsapp-web.js stores its logged-in session here; must survive restarts
    // or staff have to rescan the QR every deploy.
    WHATSAPP_SESSION_PATH: z.string().min(1).default("./.wwebjs_auth"),
    // Chromium is provided by the image rather than downloaded by puppeteer.
    PUPPETEER_EXECUTABLE_PATH: z.string().min(1).optional(),
    // Lets the server boot without a browser, for tests and health checks.
    WHATSAPP_ENABLED: z
      .string()
      .default("true")
      .transform((value) => value !== "false"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
