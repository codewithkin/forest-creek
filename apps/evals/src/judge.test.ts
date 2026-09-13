import { describe, expect, test } from "bun:test";

import { isInconsistent, judgementPasses, type Judgement } from "./judge";

const clean: Judgement = {
  problems: [],
  verdict: "Correct, concise and fully aligned with the inventory.",
  followsRubric: true,
  relevance: 5,
  accuracy: 5,
  helpfulness: 4,
  tone: 5,
};

describe("isInconsistent", () => {
  test("a clean, high-scoring judgement is consistent", () => {
    expect(isInconsistent(clean)).toBe(false);
  });

  test("catches the calibration incident: called correct, scored irrelevant", () => {
    // The judge's real output on an accurate rooms reply: verdict glowing, relevance 1.
    expect(isInconsistent({ ...clean, relevance: 1 })).toBe(true);
  });

  test("no problems and a met rubric cannot score low on accuracy", () => {
    expect(isInconsistent({ ...clean, accuracy: 2 })).toBe(true);
  });

  test("a failed rubric needs at least one stated problem", () => {
    expect(isInconsistent({ ...clean, followsRubric: false })).toBe(true);
  });

  test("an honest failure with reasons is consistent", () => {
    expect(
      isInconsistent({
        ...clean,
        problems: ['"Forest Suite" is not in the inventory'],
        verdict: "Invents rooms that do not exist.",
        followsRubric: false,
        accuracy: 1,
        relevance: 4,
      }),
    ).toBe(false);
  });

  test("low tone alone is not a contradiction", () => {
    expect(isInconsistent({ ...clean, tone: 2 })).toBe(false);
  });
});

describe("judgementPasses", () => {
  test("needs relevance, accuracy and the rubric", () => {
    expect(judgementPasses(clean)).toBe(true);
    expect(judgementPasses({ ...clean, accuracy: 3 })).toBe(false);
    expect(judgementPasses({ ...clean, followsRubric: false })).toBe(false);
  });

  test("tone and helpfulness are reported, not gating", () => {
    expect(judgementPasses({ ...clean, tone: 1, helpfulness: 1 })).toBe(true);
  });
});
