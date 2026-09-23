import { describe, expect, test } from "bun:test";

import type { PaynowStatusUpdate } from "@forest-creek/db";

import { paynowResultRoute } from "./paynow-result";

const update: PaynowStatusUpdate = {
  reference: "FC-ABC123",
  amount: "180.00",
  paynowReference: "123",
  pollUrl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=x",
  status: "paid",
};

const post = (route: ReturnType<typeof paynowResultRoute>, body = "reference=FC-ABC123&hash=X") =>
  route.request("/", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

describe("POST /paynow/result", () => {
  test("a forged body is refused and never reaches the booking", async () => {
    let applied = false;
    const route = paynowResultRoute(
      () => ({ ok: false, error: "hash mismatch" }),
      async () => {
        applied = true;
        return "confirmed";
      },
    );
    const res = await post(route);
    expect(res.status).toBe(400);
    expect(applied).toBe(false);
  });

  test("an authentic update is applied with the raw body the hash was checked over", async () => {
    let seenBody = "";
    let seenUpdate: PaynowStatusUpdate | undefined;
    const route = paynowResultRoute(
      (body) => {
        seenBody = body;
        return { ok: true, update };
      },
      async (u) => {
        seenUpdate = u;
        return "confirmed";
      },
    );
    const res = await post(route, "reference=FC-ABC123&status=Paid&hash=ABC");
    expect(res.status).toBe(200);
    expect(seenBody).toBe("reference=FC-ABC123&status=Paid&hash=ABC");
    expect(seenUpdate).toEqual(update);
  });

  test("an authentic update we chose to ignore is still acknowledged, so Paynow stops retrying", async () => {
    const route = paynowResultRoute(
      () => ({ ok: true, update }),
      async () => "poll-url-mismatch",
    );
    expect((await post(route)).status).toBe(200);
  });

  test("a failure applying it answers 500 so Paynow retries later", async () => {
    const route = paynowResultRoute(
      () => ({ ok: true, update }),
      async () => {
        throw new Error("database unavailable");
      },
    );
    expect((await post(route)).status).toBe(500);
  });
});

test("a forged body is recorded as rejected, with the reason", async () => {
  const seen: Array<[string, string]> = [];
  const route = paynowResultRoute(
    () => ({ ok: false, error: "hash mismatch" }),
    async () => "confirmed",
    async (body, reason) => void seen.push([body, reason]),
  );
  await post(route, "reference=FC-ABC123&hash=BAD");
  expect(seen).toEqual([["reference=FC-ABC123&hash=BAD", "hash mismatch"]]);
});
