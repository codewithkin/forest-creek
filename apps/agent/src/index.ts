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

export default {
  port: env.AGENT_PORT,
  fetch: app.fetch,
};
