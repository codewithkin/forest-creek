import {
  buildInstructions,
  getConcierge,
  isConciergeConfigured,
  toConciergeMessages,
  todayInHarare,
} from "@forest-creek/ai";
import { appendChatMessage, getChatHistory, getChatSessions } from "@forest-creek/db";
import { z } from "zod";

import { adminProcedure, publicProcedure, router } from "../index";

const HISTORY_TURNS = 20;

const OFFLINE_REPLY =
  "I'm not available right now, but the team at Forest Creek Lodge will pick this up — reach them at reservations@forestcreeklodge.co.zw or +263 71 234 5678.";

const sessionIdSchema = z.string().trim().min(1).max(128);

export const chatRouter = router({
  history: publicProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ input }) => getChatHistory(input.sessionId)),

  send: publicProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      const guestMessage = await appendChatMessage({
        sessionId: input.sessionId,
        sender: "guest",
        content: input.content,
      });

      // The guest turn is already saved, so a missing key costs them nothing
      // but the answer — staff still see the question in the inbox.
      if (!isConciergeConfigured()) {
        return {
          guestMessage,
          reply: await appendChatMessage({
            sessionId: input.sessionId,
            sender: "ai",
            content: OFFLINE_REPLY,
          }),
        };
      }

      const history = await getChatHistory(input.sessionId, HISTORY_TURNS);
      const result = await getConcierge().generate(toConciergeMessages(history), {
        instructions: buildInstructions(todayInHarare()),
      });

      return {
        guestMessage,
        reply: await appendChatMessage({
          sessionId: input.sessionId,
          sender: "ai",
          content: result.text.trim() || OFFLINE_REPLY,
        }),
      };
    }),

  sessions: adminProcedure.query(() => getChatSessions()),

  reply: adminProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(({ input }) => {
      return appendChatMessage({
        sessionId: input.sessionId,
        sender: "admin",
        content: input.content,
      });
    }),
});
