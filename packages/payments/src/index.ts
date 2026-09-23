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
import { parseStatusUpdate, type ParseStatusUpdateResult } from "./status-update";

export * from "./gateway";
export * from "./status-update";

export function isPaynowConfigured(): boolean {
  return Boolean(env.PAYNOW_INTEGRATION_ID && env.PAYNOW_INTEGRATION_KEY);
}

export class PaynowNotConfiguredError extends Error {
  constructor() {
    super("Paynow is not configured: set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY.");
    this.name = "PaynowNotConfiguredError";
  }
}

/**
 * The API's own public address, where Paynow POSTs each status change
 * (apps/server mounts the receiver at PAYNOW_RESULT_PATH). SERVER_URL wins;
 * the API server always has BETTER_AUTH_URL, which is the same host. The
 * WhatsApp agent has neither by default, so it must set SERVER_URL or its
 * charges fall back to polling alone.
 */
export const PAYNOW_RESULT_PATH = "/paynow/result";

function resultUrl(): string {
  const base = env.SERVER_URL ?? env.BETTER_AUTH_URL;
  // Paynow requires the field; with no public API address known, it is sent a
  // URL that answers nothing and status is read by polling, as before.
  return new URL(PAYNOW_RESULT_PATH, base ?? env.CORS_ORIGIN).toString();
}

/** Where Paynow sends the guest's browser back to: that booking's own payment page. */
export function paymentReturnUrl(reference: string): string {
  return new URL("/pay/" + encodeURIComponent(reference), env.CORS_ORIGIN).toString();
}

/**
 * One SDK instance per payment rather than a shared one: the return URL is a
 * constructor argument, and each booking returns to its own page. The object
 * is four fields — nothing is gained by caching it.
 */
function clientFor(reference: string): PaynowClient {
  if (!isPaynowConfigured()) throw new PaynowNotConfiguredError();
  return new Paynow(
    env.PAYNOW_INTEGRATION_ID!,
    env.PAYNOW_INTEGRATION_KEY!,
    resultUrl(),
    paymentReturnUrl(reference),
  ) as unknown as PaynowClient;
}

/**
 * Authenticates a result callback against our integration key. Unconfigured
 * means nothing can be verified, so nothing is believed.
 */
export function verifyPaynowStatusUpdate(body: string): ParseStatusUpdateResult {
  if (!isPaynowConfigured()) return { ok: false, error: "Paynow is not configured" };
  return parseStatusUpdate(body, env.PAYNOW_INTEGRATION_KEY!);
}

/** Starts a real mobile money charge on the guest's own phone via Paynow. */
export function initiateGuestPayment(input: InitiateMobilePaymentInput): Promise<InitiateMobilePaymentResult> {
  return initiateWithClient(clientFor(input.reference), input);
}

/**
 * Opens a Paynow hosted checkout for InnBucks or a Visa/Mastercard payment.
 * The guest is not charged until they open the returned redirectUrl.
 */
export function initiateGuestWebPayment(
  input: InitiateWebPaymentInput,
): Promise<InitiateWebPaymentResult> {
  return initiateWebWithClient(clientFor(input.reference), input);
}

/** Checks whether a previously initiated charge has been paid. */
export function pollGuestPayment(pollUrl: string): Promise<PollPaymentResult> {
  return pollWithClient(clientFor(""), pollUrl);
}
