import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Some modules here (the policy text, the links) read the validated
// environment; this package has no .env of its own.
config({ path: fileURLToPath(new URL("../../apps/server/.env", import.meta.url)) });

// Hermetic: never call a live model from this suite.
delete process.env.OPENROUTER_API_KEY;
