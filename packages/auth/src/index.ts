import { expo } from "@better-auth/expo";
import { prisma } from "@forest-creek/db";
import { env } from "@forest-creek/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// The env schema lets these be absent so the WhatsApp agent (which never mounts auth) can
// boot without them, but any process that reaches better-auth genuinely needs both.
const betterAuthSecret = env.BETTER_AUTH_SECRET;
const betterAuthUrl = env.BETTER_AUTH_URL;
const corsOrigin = env.CORS_ORIGIN;

if (!betterAuthSecret || betterAuthSecret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET is required (minimum 32 characters) where better-auth is mounted. See apps/server/.env.example.",
  );
}

if (!betterAuthUrl) {
  throw new Error(
    "BETTER_AUTH_URL is required where better-auth is mounted. See apps/server/.env.example.",
  );
}

export function createAuth() {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),

    trustedOrigins: [
      corsOrigin,

      "forest-creek://",
      "exp://",
      "http://localhost:8081",
    ],
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "guest",
          // Never client-settable, or a sign-up could hand itself admin.
          input: false,
        },
      },
    },
    secret: betterAuthSecret,
    baseURL: betterAuthUrl,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [expo()],
  });
}

export const auth = createAuth();
