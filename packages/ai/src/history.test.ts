import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@forest-creek/db";

import { stripPhotoNotes, toConciergeMessages } from "./history";

const message = (sender: ChatMessage["sender"], content: string) => ({ sender, content }) as ChatMessage;

describe("toConciergeMessages", () => {
  test("a photo note is replayed as a record, not as words the assistant said", () => {
    const [replayed] = toConciergeMessages([message("ai", "📷 Sent 1 photo: Forest Creek (photo 1 of 1)")]);
    expect(replayed).toEqual({ role: "assistant", content: "[Photos already sent: Forest Creek (photo 1 of 1)]" });
  });

  test("guests, staff and ordinary replies are unchanged", () => {
    expect(
      toConciergeMessages([message("guest", "hi"), message("admin", "We'll call you"), message("ai", "Hello!")]),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "[Staff] We'll call you" },
      { role: "assistant", content: "Hello!" },
    ]);
  });
});

describe("stripPhotoNotes", () => {
  test("takes out a note the model copied onto the end of its reply (seen live)", () => {
    expect(stripPhotoNotes("Here is Forest Creek in Vumba, our main property.📷 Sent 1 photo: Forest Creek (photo 1 of 1)")).toBe(
      "Here is Forest Creek in Vumba, our main property.",
    );
  });

  test("and the bracketed record, wherever it appears", () => {
    expect(stripPhotoNotes("[Photos already sent: Caraway (photos 1–3 of 8)]\nHere are three more.")).toBe("Here are three more.");
  });

  test("leaves a reply without notes alone", () => {
    expect(stripPhotoNotes("Here are three of the Family Room.\n\nWant more?")).toBe("Here are three of the Family Room.\n\nWant more?");
  });
});
