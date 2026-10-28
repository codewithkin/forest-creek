import { describe, expect, test } from "bun:test";

import { sentMessageId, withRetries } from "./send-retry";

const noWait = async () => undefined;

describe("withRetries", () => {
  test("a send that fails once is tried again and lands", async () => {
    let calls = 0;
    const retried: number[] = [];
    const result = await withRetries(
      async () => {
        calls++;
        if (calls === 1) throw new Error("upload dropped");
        return "sent";
      },
      [10, 20],
      (_, tryNumber) => retried.push(tryNumber),
      noWait,
    );
    expect(result).toBe("sent");
    expect(retried).toEqual([2]);
  });

  test("gives up after the last retry with the last error", async () => {
    let calls = 0;
    let message = "";
    try {
      await withRetries(async () => {
        calls++;
        throw new Error(`fail ${calls}`);
      }, [10, 20], undefined, noWait);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(calls).toBe(3);
    expect(message).toBe("fail 3");
  });
});

test("reads a sent message's id under either name", () => {
  expect(sentMessageId({ id: { _serialized: "true_1@c.us_ABC" } })).toBe("true_1@c.us_ABC");
  expect(sentMessageId({ id: { $1: "true_1@c.us_DEF" } })).toBe("true_1@c.us_DEF");
  expect(sentMessageId(undefined)).toBeUndefined();
});
