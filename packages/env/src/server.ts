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
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
