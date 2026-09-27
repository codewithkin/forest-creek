/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import { networkErrorCode, resilientFetch } from "./resilient-fetch";

/** The shape undici throws: TypeError("fetch failed") with the real error as its cause. */
function fetchFailed(code: string) {
  return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });
}

const INTERNAL = "http://server:3000";
const PUBLIC = "https://api.forestcreek.co.zw";
const noWait = async () => {};

function fakeFetch(outcomes: Array<Error | number>) {
  const calls: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    calls.push(String(input));
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    return new Response("ok", { status: next ?? 200 });
  };
  return { fetch, calls };
}

describe("resilientFetch", () => {
  it("reads the code from undici's cause chain", () => {
    expect(networkErrorCode(fetchFailed("ENOTFOUND"))).toBe("ENOTFOUND");
    expect(networkErrorCode(new Error("plain"))).toBeUndefined();
  });

  it("falls back to the public API when the internal name does not resolve", async () => {
    const { fetch, calls } = fakeFetch([fetchFailed("ENOTFOUND"), 200]);
    const call = resilientFetch({ bases: [INTERNAL, PUBLIC], fetch, sleep: noWait });
    const response = await call(`${INTERNAL}/trpc/properties.list?batch=1`);
    expect(response.status).toBe(200);
    expect(calls).toEqual([`${INTERNAL}/trpc/properties.list?batch=1`, `${PUBLIC}/trpc/properties.list?batch=1`]);
  });

  it("retries the one public name through a brief DNS failure (the production crash)", async () => {
    const { fetch, calls } = fakeFetch([fetchFailed("ENOTFOUND"), fetchFailed("EAI_AGAIN"), 200]);
    const call = resilientFetch({ bases: [PUBLIC], fetch, sleep: noWait });
    expect((await call(`${PUBLIC}/trpc/rooms.list`)).status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it("gives up after its attempts with the original error", async () => {
    const { fetch } = fakeFetch([1, 2, 3, 4].map(() => fetchFailed("ENOTFOUND")));
    const call = resilientFetch({ bases: [PUBLIC], fetch, sleep: noWait, attempts: 4 });
    expect(await call(`${PUBLIC}/trpc/x`).catch(networkErrorCode)).toBe("ENOTFOUND");
  });

  it("never resends a mutation that may have reached the API", async () => {
    const { fetch, calls } = fakeFetch([fetchFailed("ECONNRESET"), 200]);
    const call = resilientFetch({ bases: [PUBLIC], fetch, sleep: noWait });
    expect(await call(`${PUBLIC}/trpc/bookings.create`, { method: "POST" }).catch(networkErrorCode)).toBe("ECONNRESET");
    expect(calls).toHaveLength(1);
  });

  it("does resend a mutation that never connected", async () => {
    const { fetch, calls } = fakeFetch([fetchFailed("ECONNREFUSED"), 200]);
    const call = resilientFetch({ bases: [INTERNAL, PUBLIC], fetch, sleep: noWait });
    expect((await call(`${INTERNAL}/trpc/bookings.create`, { method: "POST" })).status).toBe(200);
    expect(calls[1]).toBe(`${PUBLIC}/trpc/bookings.create`);
  });

  it("takes a URL object too, as better-auth passes one", async () => {
    const { fetch, calls } = fakeFetch([fetchFailed("ENOTFOUND"), 200]);
    const call = resilientFetch({ bases: [INTERNAL, PUBLIC], fetch, sleep: noWait });
    expect((await call(new URL(`${INTERNAL}/api/auth/get-session`))).status).toBe(200);
    expect(calls[1]).toBe(`${PUBLIC}/api/auth/get-session`);
  });

  it("leaves HTTP errors and non-network failures alone", async () => {
    const { fetch, calls } = fakeFetch([500]);
    const call = resilientFetch({ bases: [PUBLIC], fetch, sleep: noWait });
    expect((await call(`${PUBLIC}/trpc/x`)).status).toBe(500);
    expect(calls).toHaveLength(1);
  });
});
