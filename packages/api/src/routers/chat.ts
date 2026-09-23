import {
  collectToolFacts,
  groundReply,
  isConciergeConfigured,
  runConcierge,
  toConciergeMessages,
  todayInHarare,
} from "@forest-creek/ai";
import {
  appendChatMessage,
  getBookingByReference,
  getChatHistory,
  getChatSessions,
} from "@forest-creek/db";
import { brand } from "@forest-creek/ai/brand";
import { bookingPageUrl } from "@forest-creek/ai/links";
import { describeError } from "@forest-creek/db/log";
import { z } from "zod";

import { publicProcedure, router, scopeProperties, staffProcedure } from "../index";

const HISTORY_TURNS = 20;

const OFFLINE_REPLY =
  `I'm not available right now, but the team at Forest Creek will pick this up — reach them at ${brand.reservationsEmail} or ${brand.reservationsPhone}.`;

const FAILURE_REPLY =
  `Sorry, something went wrong on my side. Your message is saved and the team at Forest Creek will follow up — or call ${brand.reservationsPhone}.`;

const sessionIdSchema = z.string().trim().min(1).max(128);

export const chatRouter = router({
  history: publicProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ input }) => getChatHistory(input.sessionId)),

  send: publicProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        propertyId: z.string().min(1).optional(),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      const guestMessage = await appendChatMessage({
        sessionId: input.sessionId,
        propertyId: input.propertyId,
        sender: "guest",
        content: input.content,
      });

      const answer = (content: string) =>
        appendChatMessage({
          sessionId: input.sessionId,
          propertyId: input.propertyId,
          sender: "ai",
          content,
        });

      // The guest turn is already saved, so a missing key costs them nothing
      // but the answer — staff still see the question in the inbox.
      if (!isConciergeConfigured()) {
        return { guestMessage, reply: await answer(OFFLINE_REPLY) };
      }

      try {
        const history = await getChatHistory(input.sessionId, HISTORY_TURNS);
        const run = await runConcierge(toConciergeMessages(history), { today: todayInHarare() });

        // One line per reply, so which model actually answered is auditable in
        // the server log rather than assumed from configuration.
        console.info(
          `[concierge] ${run.modelId ?? "unknown model"} via ${run.provider ?? "unknown provider"} in ${run.latencyMs}ms, tools: ${run.toolsCalled.join(", ") || "none"}`,
        );

        // The same guard as WhatsApp. A website visitor is anonymous, so they
        // own no booking by phone and can only be shown references they typed.
        const grounded = await groundReply({
          reply: run.text || FAILURE_REPLY,
          guestPhone: null,
          guestMessage: input.content,
          facts: collectToolFacts(run.toolResults),
          siteOrigin: new URL(bookingPageUrl).origin,
          lookupReference: async (reference) => {
            const booking = await getBookingByReference(reference);
            return booking ? { guestPhone: booking.guestPhone } : null;
          },
        });
        if (grounded.blocked) {
          console.warn(
            `[concierge] replaced an ungrounded reply for ${input.sessionId}: ${grounded.reason}`,
          );
        }

        return { guestMessage, reply: await answer(grounded.reply) };
      } catch (error) {
        // A model or provider outage must not turn into a 500 in the chat window.
        // describeError, not the error: an AI provider error carries the whole
        // request, i.e. the guest's conversation.
        console.error(`[concierge] generate failed: ${describeError(error)}`);
        return { guestMessage, reply: await answer(FAILURE_REPLY) };
      }
    }),

  sessions: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }).optional())
    .query(({ ctx, input }) => getChatSessions(scopeProperties(ctx.staff, input?.propertyId))),

  reply: staffProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        propertyId: z.string().min(1).optional(),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(({ input }) => {
      return appendChatMessage({
        sessionId: input.sessionId,
        propertyId: input.propertyId,
        sender: "admin",
        content: input.content,
      });
    }),
});
