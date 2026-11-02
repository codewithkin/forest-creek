import { describe, expect, test } from "bun:test";

import { MOBILE_MONEY_PATHS, PAYMENTS_UNREACHABLE_MESSAGE, remoteMobileMoneyGateway } from "./mobile-money";

type Seen = { url: string; init: RequestInit };

function fakeFetch(respond: (seen: Seen) => Response | Promise<Response>) {
  const calls: Seen[] = [];
  const send = (async (url: string, init: RequestInit) => {
    const seen = { url: String(url), init };
    calls.push(seen);
    return respond(seen);
  }) as unknown as typeof fetch;
  return { send, calls };
}

describe("remoteMobileMoneyGateway", () => {
  test("starts a charge on the API with the shared key, and hands back its answer", async () => {
    const answer = { ok: true, reference: "FC-ABC123", amountUsd: 60, kind: "deposit", balanceAfter: 60, instructions: "Dial *151#" };
    const { send, calls } = fakeFetch(() => Response.json(answer));
    const gateway = remoteMobileMoneyGateway({ serverUrl: "https://api.example.com/", apiKey: "k".repeat(20), fetch: send });

    expect(await gateway.initiate("FC-ABC123", "0771111111", { payInFull: true })).toEqual(answer as never);
    expect(calls[0]!.url).toBe(`https://api.example.com${MOBILE_MONEY_PATHS.initiate}`);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${"k".repeat(20)}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ reference: "FC-ABC123", phone: "0771111111", payInFull: true });
  });

  test("a refusal from the API (dates gone, already paid) reaches the tool as it was", async () => {
    const { send } = fakeFetch(() => Response.json({ ok: false, error: "Those nights are no longer available.", code: "ROOM_UNAVAILABLE" }));
    const gateway = remoteMobileMoneyGateway({ serverUrl: "https://api.example.com", apiKey: "x".repeat(20), fetch: send });
    expect(await gateway.check("FC-ABC123")).toEqual({ ok: false, error: "Those nights are no longer available.", code: "ROOM_UNAVAILABLE" });
  });

  test("an API that cannot be reached, or answers with no result, is a plain refusal — never a throw", async () => {
    const down = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    const broken = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    for (const { send } of [down, broken]) {
      const gateway = remoteMobileMoneyGateway({ serverUrl: "https://api.example.com", apiKey: "x".repeat(20), fetch: send });
      expect(await gateway.initiate("FC-ABC123", "0771111111", {})).toEqual({ ok: false, error: PAYMENTS_UNREACHABLE_MESSAGE });
    }
  });
});
