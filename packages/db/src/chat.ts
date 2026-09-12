import { z } from "zod";

import { prisma } from "./client";
import { chatSenderSchema } from "./domain";

import type { ChatMessage } from "../prisma/generated/client";

export type { ChatMessage };

const DEFAULT_HISTORY_LIMIT = 50;

export const appendChatMessageSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  sender: chatSenderSchema,
  content: z.string().trim().min(1).max(4000),
});

export type AppendChatMessageInput = z.infer<typeof appendChatMessageSchema>;

/** Oldest first, so the result can be replayed straight into a transcript. */
export function getChatHistory(
  sessionId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<ChatMessage[]> {
  return prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export function appendChatMessage(input: AppendChatMessageInput): Promise<ChatMessage> {
  const data = appendChatMessageSchema.parse(input);
  return prisma.chatMessage.create({ data });
}

export type ChatSessionSummary = {
  sessionId: string;
  messageCount: number;
  lastMessageAt: Date;
};

/** Backs the staff inbox: one row per chat widget session, most recent first. */
export async function getChatSessions(limit = 50): Promise<ChatSessionSummary[]> {
  const groups = await prisma.chatMessage.groupBy({
    by: ["sessionId"],
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: limit,
  });

  return groups.map((group) => ({
    sessionId: group.sessionId,
    messageCount: group._count._all,
    lastMessageAt: group._max.createdAt ?? new Date(0),
  }));
}
