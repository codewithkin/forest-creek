import { expect, test } from "bun:test";

import { redactPaynowError } from "./payments";

test("keeps Paynow's reason, masks anything that could be the guest's email or number", () => {
  expect(redactPaynowError("Invalid authemail kinzinzombe07@gmail.com for 0775101506")).toBe("Invalid authemail [email] for [number]");
  expect(redactPaynowError("Mobile number +263 77 510 1506 is not registered for EcoCash")).toBe(
    "Mobile number [number] is not registered for EcoCash",
  );
  expect(redactPaynowError("Integration in test mode")).toBe("Integration in test mode");
});

test("a booking reference and an amount survive", () => {
  expect(redactPaynowError("FC-VBZ78W: amount 120.00 exceeds limit")).toBe("FC-VBZ78W: amount 120.00 exceeds limit");
});
