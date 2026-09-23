/**
 * The actual request/response shaping for Paynow — import-free and given a
 * client explicitly, so it is unit tested without the validated environment or
 * a real Paynow account. `./index.ts` wires this to the real SDK and the
 * env-configured credentials.
 *
 * Paynow has two entry points and they behave differently:
 *
 * - Express mobile money (`sendMobile`) pushes a PIN prompt straight to the
 *   guest's handset. It only accepts Ecocash and OneMoney.
 * - Web checkout (`send`) returns a URL to Paynow's own hosted page, which is
 *   how everything else is paid — InnBucks, and Visa/Mastercard for guests
 *   paying from outside Zimbabwe.
 *
 * Both return a poll URL, so the status side of this file is shared.
 */

/** Paynow's mobile money express checkout only ever means one of these two rails. */
export const mobileMoneyMethods = ["ecocash", "onemoney"] as const;
export type MobileMoneyMethod = (typeof mobileMoneyMethods)[number];

/** Paid on Paynow's hosted page rather than by a prompt on the guest's phone. */
export const webCheckoutMethods = ["innbucks", "visa"] as const;
export type WebCheckoutMethod = (typeof webCheckoutMethods)[number];

export type PaynowMethod = MobileMoneyMethod | WebCheckoutMethod;

export function isMobileMoneyMethod(method: string): method is MobileMoneyMethod {
  return (mobileMoneyMethods as readonly string[]).includes(method);
}

export function isWebCheckoutMethod(method: string): method is WebCheckoutMethod {
  return (webCheckoutMethods as readonly string[]).includes(method);
}

/**
 * The slice of the `paynow` SDK's `Paynow` class this package actually calls.
 * Kept minimal and structural so a test can hand in a fake without importing
 * the real SDK (which does real HTTP).
 */
export type PaynowClient = {
  createPayment(reference: string, authEmail: string): PaynowPayment;
  send(payment: PaynowPayment): Promise<PaynowResponse>;
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
export type InnbucksInfo = {
  authorizationcode: string;
  /** Opens the InnBucks app straight on the payment. */
  deep_link_url: string;
  /** The same code as a scannable image, for a guest on another device. */
  qr_code: string;
  expires_at?: string;
};

export type PaynowResponse =
  | {
      success: boolean;
      error?: string;
      pollUrl?: string;
      instructions?: string;
      status?: string;
      /** Paynow's hosted payment page — only web checkout returns one. */
      redirectUrl?: string;
      innbucks_info?: InnbucksInfo[];
    }
  | undefined;

export type InitiateMobilePaymentInput = {
  /** The booking reference; Paynow's own reference for this attempt. */
  reference: string;
  amountUsd: number;
  guestEmail: string;
  /** The mobile money number to charge — asked for explicitly, never assumed. */
  phone: string;
  method: MobileMoneyMethod;
  /** What the charge is for, shown on Paynow ("Deposit", "Balance"...). */
  title?: string;
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
  payment.add(input.title ?? "Stay balance", input.amountUsd);

  const outcome = await callPaynow(() => client.sendMobile(payment, input.phone, input.method));
  if (outcome.threw) return { ok: false, error: outcome.message };

  const response = outcome.response;
  if (!response) return { ok: false, error: "Paynow did not respond. Try again shortly." };
  if (!response.success || !response.pollUrl) {
    return { ok: false, error: response.error || "Paynow declined the request." };
  }

  return { ok: true, pollUrl: response.pollUrl, instructions: response.instructions || FALLBACK_INSTRUCTIONS };
}

export type InitiateWebPaymentInput = {
  /** The booking reference; Paynow's own reference for this attempt. */
  reference: string;
  amountUsd: number;
  guestEmail: string;
  method: WebCheckoutMethod;
  /** What the charge is for, shown on Paynow's page. */
  title?: string;
};

export type InitiateWebPaymentResult =
  | {
      ok: true;
      pollUrl: string;
      /** Where to send the guest to actually pay. */
      redirectUrl: string;
      instructions: string;
      /** Present when Paynow answered with an InnBucks authorisation. */
      innbucks?: InnbucksInfo;
    }
  | { ok: false; error: string };

const WEB_INSTRUCTIONS: Record<WebCheckoutMethod, string> = {
  innbucks: "Open the link to pay with InnBucks, then come back to this page.",
  visa: "Open the link to pay by Visa or Mastercard, then come back to this page.",
};

/**
 * Opens a Paynow hosted checkout. Unlike the mobile money flow there is no
 * prompt on a handset: nothing happens until the guest opens redirectUrl, so a
 * caller that does not hand that URL to the guest has taken no payment.
 */
export async function initiateWebPayment(
  client: PaynowClient,
  input: InitiateWebPaymentInput,
): Promise<InitiateWebPaymentResult> {
  const payment = client.createPayment(input.reference, input.guestEmail);
  payment.add(input.title ?? "Stay balance", input.amountUsd);

  const outcome = await callPaynow(() => client.send(payment));
  if (outcome.threw) return { ok: false, error: outcome.message };

  const response = outcome.response;
  if (!response) return { ok: false, error: "Paynow did not respond. Try again shortly." };
  if (!response.success || !response.pollUrl) {
    return { ok: false, error: response.error || "Paynow declined the request." };
  }
  if (!response.redirectUrl) {
    // A poll URL with nowhere to send the guest is not a usable checkout.
    return { ok: false, error: "Paynow did not return a payment page. Try again shortly." };
  }

  return {
    ok: true,
    pollUrl: response.pollUrl,
    redirectUrl: response.redirectUrl,
    instructions: response.instructions || WEB_INSTRUCTIONS[input.method],
    innbucks: response.innbucks_info?.[0],
  };
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
