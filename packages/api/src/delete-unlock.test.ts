import { describe, expect, test } from "bun:test";

import { createDeleteUnlocks } from "./delete-unlock";

describe("createDeleteUnlocks", () => {
  test("a session may delete for the window after its password, and not before or after", () => {
    const unlocks = createDeleteUnlocks(5 * 60_000);
    expect(unlocks.isUnlocked("s1", 0)).toBe(false);
    unlocks.unlock("s1", 1_000);
    expect(unlocks.isUnlocked("s1", 1_000)).toBe(true);
    expect(unlocks.isUnlocked("s1", 1_000 + 5 * 60_000 - 1)).toBe(true);
    expect(unlocks.isUnlocked("s1", 1_000 + 5 * 60_000)).toBe(false);
  });

  test("one session's password never unlocks another's, and no session is never unlocked", () => {
    const unlocks = createDeleteUnlocks(60_000);
    unlocks.unlock("owner", 0);
    expect(unlocks.isUnlocked("manager", 10)).toBe(false);
    expect(unlocks.isUnlocked(undefined, 10)).toBe(false);
    expect(unlocks.isUnlocked("", 10)).toBe(false);
  });

  test("expired unlocks are swept", () => {
    const unlocks = createDeleteUnlocks(60_000);
    unlocks.unlock("a", 0);
    unlocks.unlock("b", 0);
    unlocks.unlock("c", 120_000);
    expect(unlocks.size()).toBe(1);
  });
});
