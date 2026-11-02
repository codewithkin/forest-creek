import {
  checkMobileMoneyPayment,
  initiateMobileMoneyPayment,
  type CheckPaymentResult,
  type InitiatePaymentResult,
  type PaymentOptions,
} from "@forest-creek/db";

/** What a refused charge looks like on the way back to the tool. */
type Refusal = { ok: false; error: string; code?: string };

/**
 * How request-payment and check-payment-status reach Paynow. By default they
 * call packages/db directly, with this process's Paynow keys. The WhatsApp
 * agent swaps in `remoteMobileMoneyGateway`, so its charges go through the API
 * server and only one service needs keys that work: live, the agent held a
 * different key from the API and every WhatsApp charge came back "Invalid Hash"
 * while the website's went through.
 */
export type MobileMoneyGateway = {
  initiate(reference: string, phone: string, options: PaymentOptions): Promise<InitiatePaymentResult | Refusal>;
  check(reference: string): Promise<CheckPaymentResult | Refusal>;
};

const localGateway: MobileMoneyGateway = {
  initiate: initiateMobileMoneyPayment,
  check: checkMobileMoneyPayment,
};

let gateway: MobileMoneyGateway = localGateway;

export function useMobileMoneyGateway(next: MobileMoneyGateway | undefined): void {
  gateway = next ?? localGateway;
}

export function mobileMoneyGateway(): MobileMoneyGateway {
  return gateway;
}

/** The API server's paths for charges started elsewhere. */
export const MOBILE_MONEY_PATHS = {
  initiate: "/internal/mobile-money/initiate",
  check: "/internal/mobile-money/check",
} as const;

export const PAYMENTS_UNREACHABLE_MESSAGE =
  "Our payment system couldn't be reached just now, so nothing was charged. Please try again in a minute.";

/**
 * Starts and checks charges on the API server, authorised with the shared
 * AGENT_API_KEY. A network failure or an unexpected answer becomes a plain
 * refusal for the guest; nothing here throws.
 */
export function remoteMobileMoneyGateway(config: {
  serverUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  /** Paynow can take a while to accept a mobile charge. */
  timeoutMs?: number;
}): MobileMoneyGateway {
  const send = config.fetch ?? fetch;
  const base = config.serverUrl.replace(/\/+$/, "");

  async function call<T>(path: string, body: unknown): Promise<T | Refusal> {
    try {
      const response = await send(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
      });
      const answer = (await response.json().catch(() => undefined)) as { ok?: unknown } | undefined;
      if (answer && typeof answer.ok === "boolean") return answer as T | Refusal;
      console.error(`[payments] the API answered ${path} with HTTP ${response.status} and no result`);
      return { ok: false, error: PAYMENTS_UNREACHABLE_MESSAGE };
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      console.error(`[payments] could not reach the API for ${path}: ${reason}`);
      return { ok: false, error: PAYMENTS_UNREACHABLE_MESSAGE };
    }
  }

  return {
    initiate: (reference, phone, options) =>
      call<InitiatePaymentResult>(MOBILE_MONEY_PATHS.initiate, { reference, phone, payInFull: options.payInFull }),
    check: (reference) => call<CheckPaymentResult>(MOBILE_MONEY_PATHS.check, { reference }),
  };
}
