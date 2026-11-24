import { describe, expect, test } from "bun:test";

import { incomingText } from "./shared-location";

describe("a location shared on WhatsApp", () => {
  test("becomes a line the agent can pass to get-directions, never the thumbnail's data", () => {
    expect(
      incomingText({ type: "location", body: "/9j/4AAQSkZJRgABAQ…", location: { latitude: -18.970701, longitude: "32.670913" } }),
    ).toBe("📍 My location: -18.97070, 32.67091");
    expect(
      incomingText({ type: "location", body: "", location: { latitude: -18.97, longitude: 32.67, name: "Meikles Park", address: "Mutare" } }),
    ).toBe("📍 My location: -18.97000, 32.67000 (Meikles Park, Mutare)");
  });

  test("ordinary messages pass through; a broken location is dropped", () => {
    expect(incomingText({ type: "chat", body: "How far are you from Mutare?" })).toBe("How far are you from Mutare?");
    expect(incomingText({ type: "location", body: "xyz", location: { latitude: "nope", longitude: 1 } })).toBe("");
  });
});
