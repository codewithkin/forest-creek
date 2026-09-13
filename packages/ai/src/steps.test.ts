import { describe, expect, test } from "bun:test";

import { groundFirstStep } from "./steps";

describe("groundFirstStep", () => {
  test("requires a tool call on the first step", () => {
    expect(groundFirstStep({ stepNumber: 0 })).toEqual({ toolChoice: "required" });
  });

  test("leaves later steps free, so the agent can answer", () => {
    expect(groundFirstStep({ stepNumber: 1 })).toBeUndefined();
    expect(groundFirstStep({ stepNumber: 4 })).toBeUndefined();
  });
});
