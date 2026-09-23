import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Integration tests talk to the same Postgres the dev server uses; this
// package has no .env of its own.
config({ path: fileURLToPath(new URL("../../apps/server/.env", import.meta.url)) });

// Never charge anyone from a test run: with Paynow unconfigured, every
// payment path stops before the gateway.
delete process.env.PAYNOW_INTEGRATION_ID;
delete process.env.PAYNOW_INTEGRATION_KEY;
