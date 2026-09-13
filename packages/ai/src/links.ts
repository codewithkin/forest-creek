import { env } from "@forest-creek/env/server";

/**
 * The one booking page address the assistants may give. Without it the model
 * made addresses up — two different ones across the baseline evals.
 */
export const bookingPageUrl = new URL("/book", env.CORS_ORIGIN).toString();
