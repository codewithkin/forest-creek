import { env } from "@forest-creek/env/server";

import { createApp } from "./app";
import { startWhatsapp, stopWhatsapp } from "./whatsapp";

const app = createApp();

void startWhatsapp();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stopWhatsapp().finally(() => process.exit(0));
  });
}

console.log(`[agent] listening on :${env.AGENT_PORT}`);
if (!env.PAYNOW_INTEGRATION_ID || !env.PAYNOW_INTEGRATION_KEY) {
  // Guests are told "EcoCash payment isn't set up yet" for every charge until this is fixed.
  console.warn(
    "[agent] PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY are not set on the AGENT — every EcoCash/OneMoney charge from WhatsApp will be refused. Set them (and SERVER_URL) on this service, not only on the API server.",
  );
} else if (!env.SERVER_URL) {
  console.warn("[agent] SERVER_URL is not set — Paynow results for WhatsApp charges are confirmed by polling only, not by callback.");
}

export default {
  port: env.AGENT_PORT,
  fetch: app.fetch,
};
