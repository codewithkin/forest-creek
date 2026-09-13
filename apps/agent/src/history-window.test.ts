import { afterAll, beforeAll, expect, test } from "bun:test";

import { getChatHistory, prisma } from "@forest-creek/db";

const SESSION = "whatsapp:263700000055";

async function cleanup() {
  await prisma.chatMessage.deleteMany({ where: { sessionId: SESSION } });
}

beforeAll(cleanup);
afterAll(cleanup);

test("a long thread keeps its newest turns, oldest first", async () => {
  // Explicit timestamps so ordering does not depend on write speed.
  for (let index = 1; index <= 30; index++) {
    await prisma.chatMessage.create({
      data: {
        sessionId: SESSION,
        sender: index % 2 === 1 ? "guest" : "ai",
        content: `message ${index}`,
        createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, index)),
      },
    });
  }

  const window = await getChatHistory(SESSION, 24);

  expect(window).toHaveLength(24);
  // Regression: this used to return messages 1-24, dropping the latest six —
  // including the one the agent was meant to be answering.
  expect(window[0]?.content).toBe("message 7");
  expect(window.at(-1)?.content).toBe("message 30");
});
