import { describe, expect, test } from "bun:test";

import { finalReplyText } from "./reply-text";

const call = (toolName: string) => ({ payload: { toolName } });

describe("finalReplyText", () => {
  test("drops text written alongside a tool call — the live probe that invented two properties", () => {
    // Shape of a real concierge run: step 0 wrote invented properties before
    // list-properties returned; only the last, tool-free step is grounded.
    const raw = {
      text: "Forest Creek has two lovely properties: The Riverhouse along the stream, and The Hillside Cabin. Let me show you the rooms. At Forest Creek Lodge: Executive Suite ($180).",
      steps: [
        {
          text: "Forest Creek has two lovely properties: The Riverhouse along the stream, and The Hillside Cabin.",
          toolCalls: [call("listProperties")],
        },
        { text: "Let me show you the rooms at each of our properties:", toolCalls: [call("listRooms")] },
        { text: "\n\n", toolCalls: [call("listRooms")] },
        { text: "At Forest Creek Lodge: Executive Suite ($180).", toolCalls: [] },
      ],
    };

    const reply = finalReplyText(raw);
    expect(reply).toBe("At Forest Creek Lodge: Executive Suite ($180).");
    expect(reply).not.toContain("Riverhouse");
    expect(reply).not.toContain("Let me show you");
  });

  test("never falls back to speculative text when no tool-free step spoke", () => {
    const raw = {
      text: "The Riverhouse is lovely.",
      steps: [{ text: "The Riverhouse is lovely.", toolCalls: [call("listProperties")] }],
    };
    // Empty makes callers send their safe failure reply instead.
    expect(finalReplyText(raw)).toBe("");
  });

  test("uses the last tool-free step when several spoke", () => {
    const raw = {
      steps: [
        { text: "First thought.", toolCalls: [] },
        { text: "", toolCalls: [call("checkAvailability")] },
        { text: "The Family Room is free.", toolCalls: [] },
      ],
    };
    expect(finalReplyText(raw)).toBe("The Family Room is free.");
  });

  test("a plain reply with no tools and no steps array keeps its text", () => {
    expect(finalReplyText({ text: "  Hello from the Vumba.  " })).toBe("Hello from the Vumba.");
  });

  test("strips a [Staff] marker the model copied from history", () => {
    const raw = { steps: [{ text: "[Staff] Sorry, we don't offer discounts.", toolCalls: [] }] };
    expect(finalReplyText(raw)).toBe("Sorry, we don't offer discounts.");
  });
});
