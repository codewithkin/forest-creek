import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// The judge's sanctioned facts include the booking policy text, whose links
// read the validated environment; this app has no .env of its own.
config({ path: fileURLToPath(new URL("../server/.env", import.meta.url)) });

// Unit tests only: nothing here may call a model.
delete process.env.OPENROUTER_API_KEY;
