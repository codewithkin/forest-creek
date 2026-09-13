import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Integration tests talk to the same Postgres the dev server uses; the agent
// app has no .env of its own.
config({ path: fileURLToPath(new URL("../server/.env", import.meta.url)) });

// Never launch a browser from a test run.
process.env.WHATSAPP_ENABLED = "false";

// The default suite must be hermetic: no live model calls, so it is fast,
// free and deterministic. The real conversation is exercised by
// agent.e2e.test.ts, which restores the key itself.
process.env.OPENROUTER_API_KEY_FOR_E2E = process.env.OPENROUTER_API_KEY ?? "";
delete process.env.OPENROUTER_API_KEY;
