/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import { fallbackLookup } from "./dns-fallback";

const notFound = Object.assign(new Error("getaddrinfo ENOTFOUND api.forestcreek.co.zw"), { code: "ENOTFOUND" });
const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

function run(lookup: ReturnType<typeof fallbackLookup>, all = false) {
  return new Promise<{ error: unknown; address: unknown; family?: number }>((resolve) =>
    lookup("api.forestcreek.co.zw", { all }, (error, address, family) => resolve({ error, address, family })),
  );
}

describe("fallbackLookup", () => {
  it("uses the system resolver when it answers", async () => {
    let asked = false;
    const lookup = fallbackLookup(
      (_host, _options, callback) => callback(null, "10.0.0.5", 4),
      (_host, callback) => { asked = true; callback(null, ["1.2.3.4"]); },
    );
    expect(await run(lookup)).toMatchObject({ error: null, address: "10.0.0.5", family: 4 });
    expect(asked).toBe(false);
  });

  it("asks public DNS when the container's resolver says ENOTFOUND (the production outage)", async () => {
    const lookup = fallbackLookup(
      (_host, _options, callback) => callback(notFound, ""),
      (_host, callback) => callback(null, ["84.247.140.218"]),
    );
    expect(await run(lookup)).toMatchObject({ error: null, address: "84.247.140.218", family: 4 });
    expect((await run(lookup, true)).address).toEqual([{ address: "84.247.140.218", family: 4 }]);
  });

  it("keeps the original error when public DNS cannot help either", async () => {
    const lookup = fallbackLookup(
      (_host, _options, callback) => callback(notFound, ""),
      (_host, callback) => callback(notFound, []),
    );
    expect((await run(lookup)).error).toBe(notFound);
  });

  it("leaves errors that are not about the name alone", async () => {
    const lookup = fallbackLookup(
      (_host, _options, callback) => callback(refused, ""),
      (_host, callback) => callback(null, ["1.2.3.4"]),
    );
    expect((await run(lookup)).error).toBe(refused);
  });
});
