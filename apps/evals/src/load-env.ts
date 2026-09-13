import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Must be imported before anything that reads the validated environment. The
// evals use the same database and OpenRouter key as the dev server.
config({ path: fileURLToPath(new URL("../../server/.env", import.meta.url)) });
