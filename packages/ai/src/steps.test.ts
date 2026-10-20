import { describe, expect, test } from "bun:test";

import { calledAnyTool, correctionInstructions, groundFirstStep, mergeRetry, retryTools, toolResultsDigest } from "./steps";

const readOnly = ["listRooms", "checkAvailability"];

describe("groundFirstStep", () => {
  test("requires a tool call on the first step, from the read-only tools", () => {
    expect(groundFirstStep({ stepNumber: 0 }, readOnly)).toEqual({
      toolChoice: "required",
      activeTools: readOnly,
    });
  });

  test("never offers a write tool on the forced first call", () => {
    const first = groundFirstStep({ stepNumber: 0 }, readOnly);
    expect(first?.activeTools).not.toContain("createBooking");
    expect(first?.activeTools).not.toContain("requestPayment");
  });

  test("leaves later steps free, so the agent can book and answer", () => {
    expect(groundFirstStep({ stepNumber: 1 }, readOnly)).toBeUndefined();
    expect(groundFirstStep({ stepNumber: 4 }, readOnly)).toBeUndefined();
  });
});

describe("calledAnyTool", () => {
  test("sees tool calls on the result or on any step", () => {
    expect(calledAnyTool({ toolCalls: [{ toolName: "listRooms" }] })).toBe(true);
    expect(calledAnyTool({ steps: [{ toolCalls: [] }, { toolCalls: [{}] }] })).toBe(true);
  });

  test("a run that answered from memory called nothing", () => {
    expect(calledAnyTool({ text: "We have The Riverhouse.", steps: [{ toolCalls: [] }] })).toBe(false);
    expect(calledAnyTool({})).toBe(false);
  });
});

describe("a corrected retry", () => {
  const results = [{ payload: { toolName: "request-payment", result: { ok: false, error: "The payment service couldn't take this charge" } } }];

  test("is told why its reply was stopped and what its tools already returned", () => {
    const note = correctionInstructions("payment details not backed by request-payment", results);
    expect(note).toContain("NOT sent");
    expect(note).toContain("payment details not backed by request-payment");
    expect(note).toContain('"tool":"request-payment"');
    expect(note).toContain("couldn't take this charge");
  });

  test("can never push a second PIN prompt", () => {
    const all = ["check-availability", "create-booking", "request-payment", "send-photos"];
    expect(retryTools(all, ["request-payment"])).not.toContain("request-payment");
    expect(retryTools(all, ["check-availability"])).toEqual(all);
  });

  test("a long result is cut, not dropped", () => {
    const huge = [{ toolName: "list-rooms", result: { text: "x".repeat(10_000) } }];
    expect(toolResultsDigest(huge, 100).length).toBeLessThanOrEqual(101);
    expect(toolResultsDigest([])).toBe("none");
  });
});

test("a retry keeps what the first attempt's tools did — a charge it sent may be reported", () => {
  const charge = { payload: { toolName: "request-payment", result: { ok: true } } };
  const first = { text: "", toolsCalled: ["request-payment"], toolResults: [charge], usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 }, photos: ["a"] };
  const retried = { text: "Check your phone", toolsCalled: [], toolResults: [], usage: { inputTokens: 20, outputTokens: 6, costUsd: 0.02 }, photos: [] };
  const merged = mergeRetry(first, retried, []);
  expect(merged.text).toBe("Check your phone");
  expect(merged.toolsCalled).toEqual(["request-payment"]);
  expect(merged.toolResults).toEqual([charge]);
  expect(merged.usage).toEqual({ inputTokens: 30, outputTokens: 11, costUsd: 0.03 });
  expect(merged.photos).toEqual([]);
});
