import { createHash, timingSafeEqual } from "node:crypto";

import { MOBILE_MONEY_PATHS } from "@forest-creek/ai/mobile-money";
import { BookingError, type CheckPaymentResult, type InitiatePaymentResult, type PaymentOptions } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { Hono } from "hono";
import { z } from "zod";

type Initiate = (reference: string, phone: string, options: PaymentOptions) => Promise<InitiatePaymentResult>;
type Check = (reference: string) => Promise<CheckPaymentResult>;

const initiateBody = z.object({
  reference: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(5).max(30),
  payInFull: z.boolean().optional(),
});
const checkBody = z.object({ reference: z.string().trim().min(1).max(40) });

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * The WhatsApp agent starts EcoCash/OneMoney charges here, so the Paynow keys
 * only have to be right on this server. Authorised with the AGENT_API_KEY both
 * services already share; with none set it refuses everything (503).
 *
 * A booking refusal (dates gone, already paid) is an answer, not a failure:
 * 200 with { ok: false, error, code }. Only something unexpected is a 500.
 * Logs carry the reference, never the number.
 */
export function internalPaymentsRoute(options: { apiKey: string | undefined; initiate: Initiate; check: Check }) {
  const route = new Hono();

  route.use("*", async (c, next) => {
    if (!options.apiKey) return c.json({ ok: false, error: "AGENT_API_KEY is not set on the API server" }, 503);
    const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!sameSecret(bearer, options.apiKey)) return c.json({ ok: false, error: "Not authorised" }, 401);
    await next();
  });

  async function answer<T>(reference: string, run: () => Promise<T>) {
    try {
      return { status: 200 as const, body: await run() };
    } catch (error) {
      if (error instanceof BookingError) return { status: 200 as const, body: { ok: false, error: error.message, code: error.code } };
      console.error(`[payments] agent charge request for ${reference} failed: ${describeError(error)}`);
      return { status: 500 as const, body: { ok: false, error: "The payment couldn't be started. Please try again." } };
    }
  }

  route.post(MOBILE_MONEY_PATHS.initiate.replace(/^\/internal/, ""), async (c) => {
    const parsed = initiateBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ ok: false, error: "reference and phone are required" }, 400);
    const { reference, phone, payInFull } = parsed.data;
    const result = await answer(reference, () => options.initiate(reference, phone, { payInFull }));
    return c.json(result.body, result.status);
  });

  route.post(MOBILE_MONEY_PATHS.check.replace(/^\/internal/, ""), async (c) => {
    const parsed = checkBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ ok: false, error: "reference is required" }, 400);
    const result = await answer(parsed.data.reference, () => options.check(parsed.data.reference));
    return c.json(result.body, result.status);
  });

  return route;
}
