/// <reference path="./paynow.d.ts" />
// A triple-slash reference, not a plain sibling file: a consumer importing
// this package (e.g. packages/db) only pulls in files actually reached by an
// import, and an ambient `declare module` is never imported — without this,
// "paynow" has no types anywhere outside this package's own standalone build.
import { env } from "@forest-creek/env/server";
import { Paynow } from "paynow";

import {
  initiateMobilePayment as initiateWithClient,
  initiateWebPayment as initiateWebWithClient,
  pollPayment as pollWithClient,
  type InitiateMobilePaymentInput,
  type InitiateMobilePaymentResult,
  type InitiateWebPaymentInput,
  type InitiateWebPaymentResult,
  type PaynowClient,
  type PollPaymentResult,
} from "./gateway";

export * from "./gateway";

export function isPaynowConfigured(): boolean {
  return Boolean(env.PAYNOW_INTEGRATION_ID && env.PAYNOW_INTEGRATION_KEY);
}

export class PaynowNotConfiguredError extends Error {
  constructor() {
    super("Paynow is not configured: set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY.");
    this.name = "PaynowNotConfiguredError";
  }
}

let client: PaynowClient | undefined;

/**
 * Built on first use, not at import, so this package loads fine wherever
 * Paynow is unconfigured — the same reason packages/ai builds its Mastra
 * agents lazily.
 */
function getClient(): PaynowClient {
  if (!isPaynowConfigured()) throw new PaynowNotConfiguredError();
  client ??= new Paynow(
    env.PAYNOW_INTEGRATION_ID!,
    env.PAYNOW_INTEGRATION_KEY!,
    // Where Paynow POSTs the final result server-to-server, and where it
    // sends the browser back. The result URL is still a placeholder — there is
    // no webhook receiver, and status is read by polling (pollGuestPayment);
    // add a real result endpoint before relying on it. The return URL is real
    // and now matters: a web checkout DOES send the guest's browser back here
    // when they finish paying on Paynow's page.
    new URL("/paynow/result", env.CORS_ORIGIN).toString(),
    new URL("/book", env.CORS_ORIGIN).toString(),
  ) as unknown as PaynowClient;
  return client;
}

/** Starts a real mobile money charge on the guest's own phone via Paynow. */
export function initiateGuestPayment(input: InitiateMobilePaymentInput): Promise<InitiateMobilePaymentResult> {
  return initiateWithClient(getClient(), input);
}

/**
 * Opens a Paynow hosted checkout for InnBucks or a Visa/Mastercard payment.
 * The guest is not charged until they open the returned redirectUrl.
 */
export function initiateGuestWebPayment(
  input: InitiateWebPaymentInput,
): Promise<InitiateWebPaymentResult> {
  return initiateWebWithClient(getClient(), input);
}

/** Checks whether a previously initiated charge has been paid. */
export function pollGuestPayment(pollUrl: string): Promise<PollPaymentResult> {
  return pollWithClient(getClient(), pollUrl);
}
