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

// Narrowed copies (TS won't carry the guard's narrowing into the closures below).
const authBaseUrl: string = betterAuthUrl;

function cookieDomain(): string | undefined {
  if (env.COOKIE_DOMAIN) return env.COOKIE_DOMAIN;
  // Derive the shared subdomain domain from the auth base URL, so a deployed web
  // (e.g. forest-creek.christusveritastech.co.zw) and API (forest-creek-api.…)
  // under the same registrable domain share one session cookie. Host-only cookies
  // (no Domain attribute) are scoped to the API host alone, so the server-side
  // session check on the web origin never sees them and every load bounces
  // /dashboard → /login → /dashboard. Excluded for localhost/IP hosts.
  const host = new URL(authBaseUrl).hostname;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host.includes(":") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    return undefined;
  }
  const labels = host.split(".");
  if (labels.length < 3) return undefined;
  return "." + labels.slice(1).join(".");
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
    baseURL: authBaseUrl,
    advanced: {
      // The prefix makes this deploy mint its own cookie; any host-only session
      // cookie the browser kept from before the domain fix can't shadow the new
      // shared one (browsers prefer the most-specific match, and duplicates across
      // hosts would otherwise be sent together).
      cookiePrefix: "fc",
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
        ...(cookieDomain() ? { domain: cookieDomain() } : {}),
      },
    },
    plugins: [expo()],
  });
}

export const auth = createAuth();
