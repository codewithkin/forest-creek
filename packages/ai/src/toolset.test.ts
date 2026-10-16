import { expect, test } from "bun:test";

import { toolset } from "./toolset";

test("each tool is offered under its own id, the name the prompts use", () => {
  const tools = toolset([{ id: "list-rooms" }, { id: "create-booking" }]);
  expect(Object.keys(tools)).toEqual(["list-rooms", "create-booking"]);
});

test("two tools with one id is a mistake, not a silent overwrite", () => {
  expect(() => toolset([{ id: "list-rooms" }, { id: "list-rooms" }])).toThrow(/list-rooms/);
});
