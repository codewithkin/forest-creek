/**
 * Paynow's result callback: the form POST it sends to our result URL whenever
 * a transaction changes status. Anyone can POST to a public URL, so nothing in
 * the body is believed until its hash checks out against the integration key.
 *
 * Kept free of the SDK and the validated environment, like ./gateway.ts, so it
 * is unit tested with a made-up key. The SDK's own parseStatusUpdate is not
 * used: it compares hashes with `===` and throws on a bad one, where a
 * receiver wants a constant-time compare and a result it can log.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type PaynowStatusUpdate = {
  /** Our booking reference, exactly as we sent it when starting the payment. */
  reference: string;
  /** What Paynow says was paid, as it sent it (e.g. "180.00"). */
  amount: string;
  paynowReference: string;
  pollUrl: string;
  /** Lower-cased, e.g. "paid", "cancelled", "awaiting delivery". */
  status: string;
};

export type ParseStatusUpdateResult =
  | { ok: true; update: PaynowStatusUpdate }
  | { ok: false; error: string };

/**
 * Paynow's hash: SHA-512 over every value except `hash`, in the order the
 * fields arrived, followed by the integration key — upper-case hex. The key
 * is lower-cased first, which is what the official SDK does and what Paynow
 * itself checks against.
 */
export function paynowHash(values: Array<[string, string]>, integrationKey: string): string {
  let joined = "";
  for (const [key, value] of values) {
    if (key.toLowerCase() !== "hash") joined += value;
  }
  joined += integrationKey.toLowerCase();
  return createHash("sha512").update(joined, "utf8").digest("hex").toUpperCase();
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a.toUpperCase(), "utf8");
  const right = Buffer.from(b.toUpperCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Parses and authenticates the url-encoded body Paynow POSTs to the result URL. */
export function parseStatusUpdate(body: string, integrationKey: string): ParseStatusUpdateResult {
  // URLSearchParams keeps field order and decodes '+' and %XX, which is the
  // form the hash was computed over.
  const fields = [...new URLSearchParams(body.trim()).entries()];
  if (fields.length === 0) return { ok: false, error: "empty body" };

  const get = (name: string) =>
    fields.find(([key]) => key.toLowerCase() === name)?.[1]?.trim() ?? "";

  const hash = get("hash");
  if (!hash) return { ok: false, error: "missing hash" };
  if (!sameHash(hash, paynowHash(fields, integrationKey))) {
    return { ok: false, error: "hash mismatch" };
  }

  const update: PaynowStatusUpdate = {
    reference: get("reference"),
    amount: get("amount"),
    paynowReference: get("paynowreference"),
    pollUrl: get("pollurl"),
    status: get("status").toLowerCase(),
  };
  if (!update.reference || !update.status) {
    return { ok: false, error: "missing reference or status" };
  }
  return { ok: true, update };
}
