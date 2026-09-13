import { describe, expect, test } from "bun:test";

import { groundFirstStep } from "./steps";

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
