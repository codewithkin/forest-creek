import { remoteMobileMoneyGateway, useMobileMoneyGateway } from "@forest-creek/ai/mobile-money";
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
if (env.SERVER_URL && env.AGENT_API_KEY) {
  // One set of Paynow keys, on the API: live, the agent's own key differed
  // and every WhatsApp charge was refused with "Invalid Hash".
  useMobileMoneyGateway(remoteMobileMoneyGateway({ serverUrl: env.SERVER_URL, apiKey: env.AGENT_API_KEY }));
  console.log(`[agent] EcoCash/OneMoney charges go through the API at ${env.SERVER_URL}`);
} else if (!env.PAYNOW_INTEGRATION_ID || !env.PAYNOW_INTEGRATION_KEY) {
  // Guests are told "EcoCash payment isn't set up yet" for every charge until this is fixed.
  console.warn(
    "[agent] Neither SERVER_URL + AGENT_API_KEY (charges through the API) nor PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY are set on the AGENT — every EcoCash/OneMoney charge from WhatsApp will be refused.",
  );
} else {
  console.warn("[agent] SERVER_URL / AGENT_API_KEY not set — charging with this agent's own Paynow keys, and confirming by polling only.");
}

export default {
  port: env.AGENT_PORT,
  fetch: app.fetch,
};
