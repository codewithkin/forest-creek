import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
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
    R2_PUBLIC_URL: z.url().optional(),
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
