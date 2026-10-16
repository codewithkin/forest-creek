import { expect, test } from "bun:test";

import { routingFor } from "./routing";

test("DeepSeek keeps its measured upstream order, and its retry prefers SiliconFlow", () => {
  expect(routingFor("openrouter/deepseek/deepseek-v3.2", "first")?.openrouter.provider.order).toEqual([
    "StreamLake",
    "SiliconFlow",
    "AtlasCloud",
  ]);
  expect(routingFor("openrouter/deepseek/deepseek-v3.2", "retry")?.openrouter.provider.order).toEqual(["SiliconFlow"]);
});

test("any other model gets OpenRouter's default routing, not DeepSeek's hosts", () => {
  expect(routingFor("openrouter/anthropic/claude-haiku-5.5", "first")).toBeUndefined();
  expect(routingFor("openrouter/anthropic/claude-haiku-5.5", "retry")).toBeUndefined();
});
