import { describe, expect, test } from "bun:test";

import { toWhatsappText } from "./format";

describe("toWhatsappText", () => {
  test("a full stop after a link is dropped, so WhatsApp links the real page (seen live: /policies. was Not found)", () => {
    expect(toWhatsappText("Confirming means you agree to the policy at https://forestcreek.co.zw/policies.")).toBe(
      "Confirming means you agree to the policy at https://forestcreek.co.zw/policies",
    );
    expect(toWhatsappText("Pay here: https://forestcreek.co.zw/pay/FC-EZTY5J, or ask me.")).toBe(
      "Pay here: https://forestcreek.co.zw/pay/FC-EZTY5J or ask me.",
    );
  });

  test("punctuation that is not at a link's end is left alone", () => {
    expect(toWhatsappText("See https://forestcreek.co.zw/book for rooms. Thanks!")).toBe("See https://forestcreek.co.zw/book for rooms. Thanks!");
  });

  test("turns Markdown bold into WhatsApp bold", () => {
    expect(toWhatsappText("a **family room** for two")).toBe("a *family room* for two");
    expect(toWhatsappText("a __family room__ for two")).toBe("a *family room* for two");
  });

  test("keeps a booking reference intact — the live e2e case", () => {
    // Verbatim from the live run: the guest would otherwise see the asterisks.
    expect(toWhatsappText("confirmed with reference **FC-T7KQKX** for:")).toBe(
      "confirmed with reference *FC-T7KQKX* for:",
    );
  });

  test("leaves text already in WhatsApp syntax alone", () => {
    expect(toWhatsappText("your stay is *held*, not confirmed")).toBe(
      "your stay is *held*, not confirmed",
    );
  });

  test("drops heading markers", () => {
    expect(toWhatsappText("## Your booking\nFC-T7KQKX")).toBe("Your booking\nFC-T7KQKX");
  });

  test("unwraps Markdown links so WhatsApp can link the bare URL", () => {
    expect(toWhatsappText("[Pay here](https://pay.example.com/fc-t7kqkx)")).toBe(
      "Pay here: https://pay.example.com/fc-t7kqkx",
    );
  });

  test("collapses runs of blank lines", () => {
    expect(toWhatsappText("one\n\n\n\ntwo")).toBe("one\n\ntwo");
  });

  test("does not touch arithmetic or plain prose", () => {
    expect(toWhatsappText("2 * 3 nights at $140")).toBe("2 * 3 nights at $140");
  });
});
