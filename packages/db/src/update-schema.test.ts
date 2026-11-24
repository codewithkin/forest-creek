import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  updateActivitySchema,
  updateDayVisitSchema,
  updateMenuItemSchema,
  updateMenuSectionSchema,
  updatePropertySchema,
  updateRoomSchema,
} from "./index";
import { updatesOf } from "./update-schema";

describe("updatesOf", () => {
  test("a field left out stays out — its create default is not written over it", () => {
    const create = z.object({ name: z.string(), tags: z.array(z.string()).default([]), price: z.number().nullable().default(null) });
    expect(updatesOf(create).parse({ name: "x" })).toEqual({ name: "x" });
    expect(updatesOf(create).parse({ price: 5 })).toEqual({ price: 5 });
    // The create schema still fills its defaults.
    expect(create.parse({ name: "x" })).toEqual({ name: "x", tags: [], price: null });
  });

  test("every update schema sends only what it was given", () => {
    expect(updateMenuItemSchema.parse({ id: "x", available: false })).toEqual({ id: "x", available: false });
    expect(updateMenuSectionSchema.parse({ id: "x", active: false })).toEqual({ id: "x", active: false });
    expect(updatePropertySchema.parse({ id: "x", active: false })).toEqual({ id: "x", active: false });
    expect(updateDayVisitSchema.parse({ id: "x", active: false })).toEqual({ id: "x", active: false });
    expect(updateRoomSchema.parse({ id: "x", active: false })).toEqual({ id: "x", active: false });
    expect(updateActivitySchema.parse({ id: "x", active: false })).toEqual({ id: "x", active: false });
  });
});
