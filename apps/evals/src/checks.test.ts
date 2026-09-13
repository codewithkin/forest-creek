import { describe, expect, test } from "bun:test";

import {
  checkInventedLodging,
  checkLatency,
  checkMentionsAllProperties,
  checkModelIdentity,
  checkMustMention,
  checkMustNotMention,
  checkNoPromptLeak,
  checkPaymentDetails,
  checkPrices,
  checkReferencesExist,
  checkReplyReceived,
  checkToolsCalled,
  checkWhatsappFormatting,
  expectedServedModel,
  findUnknownLodgingNames,
  findUnverifiedPrices,
  type GroundTruth,
} from "./checks";
import { brand } from "@forest-creek/ai/brand";

const property = (slug: string, name: string, location: string) => ({
  slug,
  name,
  location,
  tagline: "",
  description: "",
  phone: brand.reservationsPhone,
  email: brand.reservationsEmail,
  amenities: [],
});

const room = (propertyName: string, name: string, tier: string, rate: number, sleeps: number) => ({
  property: propertyName,
  name,
  tier,
  rate,
  sleeps,
  bedType: "Queen",
  description: "",
  amenities: [],
});

const truth: GroundTruth = {
  brand,
  properties: [
    property("forest-creek", "Forest Creek Lodge", "Vumba Mountains, Mutare"),
    property("misty-ridge", "Misty Ridge Cottages", "Bvumba Road, Mutare"),
  ],
  rooms: [
    room("Forest Creek Lodge", "Executive Suite", "executive", 180, 2),
    room("Forest Creek Lodge", "Family Room", "family", 140, 4),
    room("Forest Creek Lodge", "Standard Room", "standard", 90, 2),
    room("Misty Ridge Cottages", "Ridge Cottage", "ridge-cottage", 160, 4),
  ],
  activities: [
    { property: "Forest Creek Lodge", name: "Garden Braai Night", price: 25, description: "" },
    { property: "Forest Creek Lodge", name: "Guided Forest Walk", price: 15, description: "" },
  ],
  paymentInstructions: [],
};

describe("reply and latency", () => {
  test("an empty or near-empty reply fails", () => {
    expect(checkReplyReceived("").passed).toBe(false);
    expect(checkReplyReceived("ok").passed).toBe(false);
    expect(checkReplyReceived("The Family Room sleeps four.").passed).toBe(true);
  });

  test("latency over budget is only a warning", () => {
    const slow = checkLatency(40_000, 20_000);
    expect(slow.passed).toBe(false);
    expect(slow.severity).toBe("warn");
  });
});

describe("model identity", () => {
  test("strips the openrouter routing prefix", () => {
    expect(expectedServedModel("openrouter/deepseek/deepseek-v3.2")).toBe("deepseek/deepseek-v3.2");
  });

  test("passes when the configured model answered", () => {
    expect(
      checkModelIdentity("deepseek/deepseek-v3.2", "openrouter/deepseek/deepseek-v3.2").passed,
    ).toBe(true);
  });

  test("fails on a silent swap to a variant", () => {
    const result = checkModelIdentity(
      "deepseek/deepseek-v3.2-exp",
      "openrouter/deepseek/deepseek-v3.2",
    );
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("deepseek-v3.2-exp");
  });

  test("fails when the provider reports nothing", () => {
    expect(checkModelIdentity(undefined, "openrouter/deepseek/deepseek-v3.2").passed).toBe(false);
  });
});

describe("tool use", () => {
  test("passes when any expected tool ran", () => {
    expect(checkToolsCalled(["listProperties", "listRooms"], ["listRooms"]).passed).toBe(true);
  });

  test("fails when the model answered without tools", () => {
    const result = checkToolsCalled([], ["listRooms"]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("nothing");
  });
});

describe("invented rooms and properties", () => {
  test("catches the live incident: rooms that do not exist", () => {
    // Verbatim shape of what the website concierge said with no tool calls.
    const reply =
      "Forest Creek Lodge offers three types of rooms: the Forest Suite with a king bed, the Valley Cabin, and the Garden Loft.";
    expect(findUnknownLodgingNames(reply, truth)).toEqual([
      "Forest Suite",
      "Valley Cabin",
      "Garden Loft",
    ]);
    expect(checkInventedLodging(reply, truth).passed).toBe(false);
  });

  test("accepts real rooms and properties, including plurals and a leading article", () => {
    const reply =
      "At Forest Creek Lodge we have the Executive Suite, the Family Room and two Standard Rooms. Misty Ridge Cottages has the Ridge Cottage.";
    expect(findUnknownLodgingNames(reply, truth)).toEqual([]);
  });

  test("ignores filler like 'Our Rooms'", () => {
    expect(findUnknownLodgingNames("Our Rooms are warm and quiet.", truth)).toEqual([]);
  });

  test("lets a case allow a name the guest asked about", () => {
    const reply = "We don't have a Honeymoon Treehouse, but the Executive Suite is lovely.";
    expect(checkInventedLodging(reply, truth).passed).toBe(false);
    expect(checkInventedLodging(reply, truth, ["Honeymoon Treehouse"]).passed).toBe(true);
  });
});

describe("prices", () => {
  test("accepts rates, stay totals and stays with experiences", () => {
    expect(
      findUnverifiedPrices("$140 a night, so $280 for two nights, or $305 with the braai.", truth),
    ).toEqual([]);
  });

  test("flags an amount nothing explains, as a warning", () => {
    const result = checkPrices("The Honeymoon rate is $999 a night.", truth);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warn");
    expect(result.detail).toContain("$999");
  });
});

describe("references and payment details", () => {
  test("a reference missing from the database fails", () => {
    const result = checkReferencesExist("Your reference is FC-VJ4QG5.", new Set());
    expect(result.passed).toBe(false);
    expect(checkReferencesExist("Your reference is FC-VJ4QG5.", new Set(["FC-VJ4QG5"])).passed).toBe(
      true,
    );
  });

  test("bank details fail when no property has any configured", () => {
    expect(checkPaymentDetails("Account Number: 1234567890", truth).passed).toBe(false);
    expect(checkPaymentDetails("The lodge will send payment details shortly.", truth).passed).toBe(
      true,
    );
  });

  test("bank details are allowed once a property really has them", () => {
    const configured = { ...truth, paymentInstructions: ["CBZ Bank, Account Number 4455667788"] };
    expect(checkPaymentDetails("Pay into account number 4455667788", configured).passed).toBe(true);
  });
});

describe("mentions", () => {
  test("must-mention is case-insensitive and reports what is missing", () => {
    const result = checkMustMention("the family room", ["Family Room", "Executive Suite"]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("Executive Suite");
  });

  test("must-not-mention catches forbidden terms", () => {
    expect(checkMustNotMention("50% off, just for you", ["50% off"]).passed).toBe(false);
  });

  test("names every property", () => {
    expect(checkMentionsAllProperties("Forest Creek Lodge and Misty Ridge Cottages", truth).passed).toBe(
      true,
    );
    expect(checkMentionsAllProperties("Only Forest Creek Lodge", truth).passed).toBe(false);
  });
});

describe("channel and safety", () => {
  test("whatsapp formatting rejects Markdown the app would show literally", () => {
    expect(checkWhatsappFormatting("reference **FC-T7KQKX**").passed).toBe(false);
    expect(checkWhatsappFormatting("reference *FC-T7KQKX*").passed).toBe(true);
    expect(checkWhatsappFormatting("## Your booking").passed).toBe(false);
  });

  test("prompt leaks are caught", () => {
    expect(checkNoPromptLeak("Sure! Rules you must not break: never invent a rate").passed).toBe(
      false,
    );
    expect(checkNoPromptLeak("I'm The Vumba Guide, the concierge here.").passed).toBe(true);
  });
});
