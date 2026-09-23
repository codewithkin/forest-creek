import { describe, expect, test } from "bun:test";

import { parseStatusUpdate, paynowHash } from "./status-update";

const KEY = "3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977";

/** Builds a body the way Paynow does: fields in order, then the hash over them. */
function signedBody(fields: Array<[string, string]>, key = KEY): string {
  const params = new URLSearchParams(fields);
  params.append("hash", paynowHash(fields, key));
  return params.toString();
}

const paid: Array<[string, string]> = [
  ["reference", "FC-ABC123"],
  ["paynowreference", "123456"],
  ["amount", "180.00"],
  ["status", "Paid"],
  ["pollurl", "https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc-123"],
];

describe("parseStatusUpdate", () => {
  test("accepts a correctly signed update and normalises the status", () => {
    const result = parseStatusUpdate(signedBody(paid), KEY);
    expect(result).toEqual({
      ok: true,
      update: {
        reference: "FC-ABC123",
        amount: "180.00",
        paynowReference: "123456",
        pollUrl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc-123",
        status: "paid",
      },
    });
  });

  test("rejects an update signed with another key", () => {
    const result = parseStatusUpdate(signedBody(paid, "not-our-key"), KEY);
    expect(result).toEqual({ ok: false, error: "hash mismatch" });
  });

  test("rejects a genuine update whose amount was tampered with", () => {
    const body = signedBody(paid).replace("amount=180.00", "amount=1.00");
    expect(parseStatusUpdate(body, KEY)).toEqual({ ok: false, error: "hash mismatch" });
  });

  test("rejects a genuine update whose status was flipped to paid", () => {
    const cancelled = paid.map(([k, v]): [string, string] => [k, k === "status" ? "Cancelled" : v]);
    const body = signedBody(cancelled).replace("status=Cancelled", "status=Paid");
    expect(parseStatusUpdate(body, KEY)).toEqual({ ok: false, error: "hash mismatch" });
  });

  test("rejects a body with no hash at all", () => {
    expect(parseStatusUpdate(new URLSearchParams(paid).toString(), KEY)).toEqual({
      ok: false,
      error: "missing hash",
    });
  });

  test("rejects an empty body", () => {
    expect(parseStatusUpdate("", KEY)).toEqual({ ok: false, error: "empty body" });
  });

  test("hashes the decoded values, so encoded characters still verify", () => {
    const fields: Array<[string, string]> = [
      ["reference", "FC-ABC123"],
      ["status", "Awaiting Delivery"],
      ["pollurl", "https://www.paynow.co.zw/Interface/CheckPayment/?guid=a&b=c"],
    ];
    const result = parseStatusUpdate(signedBody(fields), KEY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update.status).toBe("awaiting delivery");
  });

  test("matches the key case-insensitively, as the SDK does", () => {
    expect(parseStatusUpdate(signedBody(paid, KEY.toUpperCase()), KEY).ok).toBe(true);
  });
});
