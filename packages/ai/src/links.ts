import { env } from "@forest-creek/env/server";

/**
 * The one booking page address the assistants may give. Without it the model
 * made addresses up — two different ones across the baseline evals.
 */
export const bookingPageUrl = new URL("/book", env.CORS_ORIGIN).toString();

/**
 * Where a guest finishes paying for a booking that already exists — the
 * WhatsApp agent books InnBucks and card stays and sends the guest here, and
 * a website guest whose payment failed comes back here to try again.
 */
export function paymentPageUrl(reference: string): string {
  return new URL(`/pay/${encodeURIComponent(reference.toUpperCase())}`, env.CORS_ORIGIN).toString();
}
