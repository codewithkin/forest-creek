/**
 * The actual request/response shaping for Paynow's mobile money flow —
 * import-free and given a client explicitly, so it is unit tested without the
 * validated environment or a real Paynow account. `./index.ts` wires this to
 * the real SDK and the env-configured credentials.
 */

/** Paynow's mobile money express checkout only ever means one of these two rails. */
export const mobileMoneyMethods = ["ecocash", "onemoney"] as const;
export type MobileMoneyMethod = (typeof mobileMoneyMethods)[number];

/**
 * The slice of the `paynow` SDK's `Paynow` class this package actually calls.
 * Kept minimal and structural so a test can hand in a fake without importing
 * the real SDK (which does real HTTP).
 */
export type PaynowClient = {
  createPayment(reference: string, authEmail: string): PaynowPayment;
  sendMobile(
    payment: PaynowPayment,
    phone: string,
    method: MobileMoneyMethod,
  ): Promise<PaynowResponse>;
  pollTransaction(pollUrl: string): Promise<PaynowResponse>;
};

export type PaynowPayment = { add(title: string, amount: number): unknown };

/**
 * The `InitResponse` the SDK resolves both `sendMobile` and `pollTransaction`
 * with. The SDK swallows a failed HTTP request into `undefined` rather than
 * rejecting — every caller here has to handle that on top of a normal reject.
 */
export type PaynowResponse =
  | { success: boolean; error?: string; pollUrl?: string; instructions?: string; status?: string }
  | undefined;

export type InitiateMobilePaymentInput = {
  /** The booking reference; Paynow's own reference for this attempt. */
  reference: string;
  amountUsd: number;
  guestEmail: string;
  /** The mobile money number to charge — asked for explicitly, never assumed. */
  phone: string;
  method: MobileMoneyMethod;
};

export type InitiateMobilePaymentResult =
  | { ok: true; pollUrl: string; instructions: string }
  | { ok: false; error: string };

const FALLBACK_INSTRUCTIONS =
  "Check your phone for a payment prompt and enter your PIN to approve it.";

// A discriminated result rather than `response | undefined | { thrown }`: the
// SDK already resolves to `undefined` on a failed request instead of
// rejecting, so `"thrown" in response` would itself throw on that path.
type PaynowOutcome = { threw: false; response: PaynowResponse } | { threw: true; message: string };

async function callPaynow(request: () => Promise<PaynowResponse>): Promise<PaynowOutcome> {
  try {
    return { threw: false, response: await request() };
  } catch (error) {
    return { threw: true, message: error instanceof Error ? error.message : "Paynow request failed" };
  }
}

export async function initiateMobilePayment(
  client: PaynowClient,
  input: InitiateMobilePaymentInput,
): Promise<InitiateMobilePaymentResult> {
  const payment = client.createPayment(input.reference, input.guestEmail);
  payment.add("Stay balance", input.amountUsd);

  const outcome = await callPaynow(() => client.sendMobile(payment, input.phone, input.method));
  if (outcome.threw) return { ok: false, error: outcome.message };

  const response = outcome.response;
  if (!response) return { ok: false, error: "Paynow did not respond. Try again shortly." };
  if (!response.success || !response.pollUrl) {
    return { ok: false, error: response.error || "Paynow declined the request." };
  }

  return { ok: true, pollUrl: response.pollUrl, instructions: response.instructions || FALLBACK_INSTRUCTIONS };
}

export type PollPaymentResult = { ok: true; paid: boolean; status: string } | { ok: false; error: string };

/** The one status string that means real money actually moved. */
const PAID_STATUS = "paid";

export async function pollPayment(client: PaynowClient, pollUrl: string): Promise<PollPaymentResult> {
  const outcome = await callPaynow(() => client.pollTransaction(pollUrl));
  if (outcome.threw) return { ok: false, error: outcome.message };

  const response = outcome.response;
  if (!response) return { ok: false, error: "Paynow did not respond. Try again shortly." };
  if (response.error) return { ok: false, error: response.error };

  const status = (response.status || "").toLowerCase();
  return { ok: true, paid: status === PAID_STATUS, status: status || "unknown" };
}
