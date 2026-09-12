import { z } from "zod";

import { prisma } from "./client";
import { chatSenderSchema } from "./domain";

import type { ChatMessage } from "../prisma/generated/client";

export type { ChatMessage };

const DEFAULT_HISTORY_LIMIT = 50;

export const appendChatMessageSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  propertyId: z.string().min(1).optional(),
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
  propertyId: string | null;
  messageCount: number;
  lastMessageAt: Date;
  lastSender: string;
  /** A thread whose last word is the guest's still needs a human. */
  needsReply: boolean;
};

/** Backs the staff inbox: one row per chat widget session, most recent first. */
export async function getChatSessions(
  propertyIds?: string[],
  limit = 50,
): Promise<ChatSessionSummary[]> {
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};

  const groups = await prisma.chatMessage.groupBy({
    by: ["sessionId"],
    where: scope,
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: limit,
  });

  if (groups.length === 0) return [];

  // One extra read gets the newest message per thread, which is what decides
  // whether a guest is still waiting.
  const latest = await prisma.chatMessage.findMany({
    where: { sessionId: { in: groups.map((group) => group.sessionId) } },
    orderBy: { createdAt: "desc" },
    select: { sessionId: true, sender: true, propertyId: true, createdAt: true },
  });

  const newestBySession = new Map<string, (typeof latest)[number]>();
  for (const message of latest) {
    if (!newestBySession.has(message.sessionId)) {
      newestBySession.set(message.sessionId, message);
    }
  }

  return groups.map((group) => {
    const newest = newestBySession.get(group.sessionId);
    return {
      sessionId: group.sessionId,
      propertyId: newest?.propertyId ?? null,
      messageCount: group._count._all,
      lastMessageAt: group._max.createdAt ?? new Date(0),
      lastSender: newest?.sender ?? "guest",
      needsReply: newest?.sender === "guest",
    };
  });
}

export function countThreadsAwaitingReply(propertyIds?: string[]): Promise<number> {
  return getChatSessions(propertyIds, 200).then(
    (sessions) => sessions.filter((session) => session.needsReply).length,
  );
}
