import { describe, expect, test } from "bun:test";

import { verdict } from "./compare";

type Result = Parameters<typeof verdict>[0];

const result = (model: string, overrides: Partial<Result>): Result => ({
  model,
  served: [model],
  replies: 60,
  passed: 54,
  failed: [],
  errors: 0,
  identityOnly: 0,
  costUsd: 0.06,
  costedReplies: 60,
  latencies: [10_000, 12_000, 15_000],
  scores: { relevance: 4.8, accuracy: 4.7, helpfulness: 4.5, tone: 4.8 },
  ...overrides,
});

describe("verdict", () => {
  const incumbent = result("deepseek", {});

  test("switches when the challenger is as good and cheaper", () => {
    expect(verdict(incumbent, result("haiku", { costUsd: 0.03 }))).toStartWith("Switch to haiku");
  });

  test("switches when the challenger is as good and clearly faster", () => {
    expect(verdict(incumbent, result("haiku", { latencies: [3_000, 4_000, 5_000] }))).toStartWith("Switch to haiku");
  });

  test("never trades accuracy for price", () => {
    expect(verdict(incumbent, result("haiku", { passed: 48, costUsd: 0.01 }))).toStartWith("Keep deepseek");
    expect(
      verdict(incumbent, result("haiku", { costUsd: 0.01, scores: { relevance: 4.8, accuracy: 4.2, helpfulness: 4.5, tone: 4.8 } })),
    ).toStartWith("Keep deepseek");
  });

  test("one reply's difference is noise, not a reason to stay", () => {
    expect(verdict(incumbent, result("haiku", { passed: 53, costUsd: 0.03 }))).toStartWith("Switch to haiku");
  });

  test("no better, no cheaper, no faster: keep what works", () => {
    expect(verdict(incumbent, result("haiku", {}))).toStartWith("Keep deepseek");
  });
});
