import { describe, expect, test } from "bun:test";

import { withoutQuery } from "./request-log";

describe("withoutQuery", () => {
  test("drops a tRPC query's input but keeps the procedure, status and timing", () => {
    const line =
      '--> GET /trpc/bookings.list?batch=1&input={"0":{"guestEmail":"tariro@example.com"}} 200 12ms';
    expect(withoutQuery(line)).toBe("--> GET /trpc/bookings.list?… 200 12ms");
  });

  test("leaves a line with no query alone", () => {
    expect(withoutQuery("<-- POST /paynow/result")).toBe("<-- POST /paynow/result");
  });
});
