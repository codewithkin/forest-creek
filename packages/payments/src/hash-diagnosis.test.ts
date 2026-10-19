import { describe, expect, test } from "bun:test";
import { Paynow } from "paynow";

import { diagnoseInvalidHash, expectedHashPrefix, isPaynowSetupError, requestHash } from "./hash-diagnosis";

/** The fields the real SDK builds for a charge, with its own hash. */
function sentBy(integrationKey: string, title = "Stay") {
  const client = new Paynow("12345", integrationKey, "https://api.example.com/paynow/result", "https://example.com/pay/FC-B8H4DD") as unknown as {
    createPayment: (reference: string, email: string) => { add: (title: string, amount: number) => void };
    buildMobile: (payment: unknown, phone: string, method: string) => Record<string, string>;
  };
  const payment = client.createPayment("FC-B8H4DD", "guest@example.com");
  payment.add(title, 120);
  return client.buildMobile(payment, "0775101506", "ecocash");
}

describe("requestHash", () => {
  test("reproduces the SDK's own hash (URL-encoded values, lower-cased key)", () => {
    const sent = sentBy("abcd-1234");
    expect(requestHash(sent, "abcd-1234")).toBe(sent.hash!);
  });
});

describe("expectedHashPrefix", () => {
  test("reads Paynow's hint, seen live", () => {
    expect(expectedHashPrefix("Invalid Hash.  Hash should start with: DCC479")).toBe("DCC479");
    expect(expectedHashPrefix("Invalid Id.")).toBeUndefined();
  });
});

describe("diagnoseInvalidHash", () => {
  test("a key that isn't this integration's", () => {
    const sent = sentBy("our-key");
    const paynowExpected = requestHash(sent, "the-real-key").slice(0, 6);
    expect(diagnoseInvalidHash(sent, "our-key", paynowExpected).verdict).toBe("wrong-key");
  });

  test("a key with capitals, lower-cased by the SDK", () => {
    const key = "ABCD-1234-EF";
    const sent = sentBy(key);
    // Paynow signs with the key as issued.
    const paynowExpected = requestHash(sent, key).slice(0, 6);
    expect(diagnoseInvalidHash(sent, key, paynowExpected).verdict).toBe("key-case");
  });

  test("a value the SDK's URL-encoding changes", () => {
    const key = "abcd-1234";
    const sent = sentBy(key, "Deposit (50%)");
    const raw = Object.fromEntries(Object.entries(sent).map(([field, value]) => [field, decodeURIComponent(value)]));
    const paynowExpected = requestHash(raw, key).slice(0, 6);
    expect(diagnoseInvalidHash(sent, key, paynowExpected).verdict).toBe("encoding");
  });
});

test("setup errors are told apart from the guest's own problems", () => {
  expect(isPaynowSetupError("Invalid Hash.  Hash should start with: DCC479")).toBe(true);
  expect(isPaynowSetupError("Invalid Id.")).toBe(true);
  expect(isPaynowSetupError("Insufficient balance")).toBe(false);
});
