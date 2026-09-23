import type { PaynowResultOutcome, PaynowStatusUpdate } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { Hono } from "hono";

type Verify = (
  body: string,
) => { ok: true; update: PaynowStatusUpdate } | { ok: false; error: string };
type Apply = (update: PaynowStatusUpdate) => Promise<PaynowResultOutcome>;
type Rejected = (body: string, reason: string) => Promise<void>;

/**
 * Paynow's result URL: it POSTs here whenever a charge changes status. This is
 * what confirms a card or InnBucks guest who closes the tab on Paynow's page
 * and never comes back to be polled.
 *
 * Takes its two steps as arguments so it is tested without Paynow or a
 * database; index.ts passes the real ones from @forest-creek/db.
 *
 * Only a forged or broken body gets a 4xx. Every authentic update is answered
 * 200 whatever came of it — an update we deliberately ignored will not become
 * acceptable by Paynow retrying it. Logs carry the reference and outcome,
 * never the guest's details or the raw body.
 */
export function paynowResultRoute(verify: Verify, apply: Apply, rejected?: Rejected) {
  const route = new Hono();

  route.post("/", async (c) => {
    const body = await c.req.text();
    const verified = verify(body);
    if (!verified.ok) {
      console.warn(`[paynow] rejected result callback: ${verified.error}`);
      // Kept for the owner's attention panel: a run of these is someone probing.
      await rejected?.(body, verified.error);
      return c.text("rejected", 400);
    }

    const { update } = verified;
    try {
      const outcome = await apply(update);
      const log = outcome === "confirmed" || outcome === "already-paid" || outcome === "status-recorded"
        ? console.log
        : console.warn;
      log(`[paynow] result for ${update.reference}: status=${update.status} -> ${outcome}`);
      return c.text("ok", 200);
    } catch (error) {
      // A database hiccup: answer 500 so Paynow tries again later.
      console.error(`[paynow] could not apply result for ${update.reference}: ${describeError(error)}`);
      return c.text("error", 500);
    }
  });

  return route;
}
