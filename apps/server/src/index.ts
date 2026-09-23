import { createContext } from "@forest-creek/api/context";
import { appRouter } from "@forest-creek/api/routers/index";
import { auth } from "@forest-creek/auth";
import {
  applyPaynowStatusUpdate,
  PAYNOW_RESULT_PATH,
  recordRejectedPaynowCallback,
  verifyPaynowStatusUpdate,
} from "@forest-creek/db";
import { ensureAdmin } from "./ensure-admin";
import { startHoldSweeper } from "./hold-sweeper";
import { startNotificationWorker } from "./notification-worker";
import { paynowResultRoute } from "./paynow-result";
import { env } from "@forest-creek/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// Bootstrap admin before the API accepts traffic. Non-fatal: the server still starts if
// this fails (config may just not include ADMIN_EMAIL/ADMIN_PASSWORD), but when it is
// configured the account exists before the first request arrives.
try {
  await ensureAdmin();
} catch (error) {
  console.error("Could not ensure the admin user at startup:", error);
}

startHoldSweeper();
startNotificationWorker();

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

app.use("/media/*", serveStatic({ root: "./public" }));

// Server-to-server from Paynow, so no CORS or session: the body's hash is the
// only credential, and it is checked before anything is read from it.
app.route(
  PAYNOW_RESULT_PATH,
  paynowResultRoute(verifyPaynowStatusUpdate, applyPaynowStatusUpdate, recordRejectedPaynowCallback),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
