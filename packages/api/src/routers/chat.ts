import {
  buildFactualReply,
  collectToolFacts,
  completePaymentLink,
  groundReply,
  isConciergeConfigured,
  paymentPagesFrom,
  photoNote,
  RESEND_WINDOW_MS,
  runConcierge,
  stripPhotoNotes,
  toConciergeMessages,
  todayInHarare,
  type AgentRun,
} from "@forest-creek/ai";
import {
  allQuotableNightlyRates,
  appendChatMessage,
  getBookingByReference,
  getChatHistory,
  getChatSessions,
  getRecentChatImages,
} from "@forest-creek/db";
import { brand } from "@forest-creek/ai/brand";
import { bookingPageUrl } from "@forest-creek/ai/links";
import { describeError } from "@forest-creek/db/log";
import { env } from "@forest-creek/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { AgentDeliveryError, deliverWhatsappReply, isWhatsappSession } from "../agent-client";

import { publicProcedure, rateLimitedProcedure, router, scopeProperties, staffProcedure } from "../index";

const HISTORY_TURNS = 20;

const OFFLINE_REPLY =
  `I'm not available right now, but the team at Forest Creek will pick this up — reach them at ${brand.reservationsEmail} or ${brand.reservationsPhone}.`;

const FAILURE_REPLY =
  `Sorry, something went wrong on my side. Your message is saved and the team at Forest Creek will follow up — or call ${brand.reservationsPhone}.`;

const sessionIdSchema = z.string().trim().min(1).max(128);

/**
 * The website assistant can book and start charges now, like WhatsApp, so a
 * visitor's messages are limited per address and per chat — generous for a
 * guest, a ceiling for anyone scripting it.
 */
const chatLimited = rateLimitedProcedure("chat", { limit: 40, windowMs: 10 * 60_000 }, (input) =>
  typeof input === "object" && input !== null && "sessionId" in input ? String(input.sessionId) : undefined,
);

export const chatRouter = router({
  history: publicProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ input }) => getChatHistory(input.sessionId)),

  send: chatLimited
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

      const answer = (content: string, images?: string[]) =>
        appendChatMessage({
          sessionId: input.sessionId,
          propertyId: input.propertyId,
          sender: "ai",
          content,
          images,
        });

      // The guest turn is already saved, so a missing key costs them nothing
      // but the answer — staff still see the question in the inbox.
      if (!isConciergeConfigured()) {
        return { guestMessage, reply: await answer(OFFLINE_REPLY) };
      }

      try {
        const history = await getChatHistory(input.sessionId, HISTORY_TURNS);
        // The same guard as WhatsApp. A website visitor owns no booking by
        // phone — only those made in this chat — so other references must be
        // ones they typed.
        const nightlyRates = await allQuotableNightlyRates();
        const ground = (candidate: AgentRun) => {
          const facts = collectToolFacts(candidate.toolResults);
          const text = stripPhotoNotes(candidate.text);
          const didSomething = facts.bookings.length > 0 || facts.payments.length > 0;
          return groundReply({
            reply: text || (didSomething ? buildFactualReply(facts) : FAILURE_REPLY),
            guestPhone: null,
            chatSessionId: input.sessionId,
            guestMessage: input.content,
            facts,
            siteOrigin: new URL(bookingPageUrl).origin,
            // Rooms' own rates and every price set for chosen dates are real prices.
            nightlyRates,
            lookupReference: async (reference) => {
              const booking = await getBookingByReference(reference);
              return booking ? { guestPhone: booking.guestPhone, chatSessionId: booking.chatSessionId } : null;
            },
          });
        };
        // The same booking agent as WhatsApp; this visitor is the chat they are in.
        const run = await runConcierge(toConciergeMessages(history), {
          today: todayInHarare(),
          chatSessionId: input.sessionId,
          recentPhotos: await getRecentChatImages(input.sessionId, new Date(Date.now() - RESEND_WINDOW_MS)),
          // A blocked reply gets one corrected attempt, told why (runBookingAgent).
          check: async (candidate) => {
            const verdict = await ground(candidate);
            return verdict.blocked ? verdict.reason : undefined;
          },
        });

        // One line per reply, so which model actually answered is auditable in
        // the server log rather than assumed from configuration.
        console.info(
          `[concierge] ${run.modelId ?? "unknown model"} via ${run.provider ?? "unknown provider"} in ${run.latencyMs}ms, tools: ${run.toolsCalled.join(", ") || "none"}`,
        );

        // The final reply (the retry's, if there was one) is checked again.
        const grounded = await ground(run);
        if (grounded.blocked) {
          console.warn(
            `[concierge] replaced an ungrounded reply for ${input.sessionId}: ${grounded.reason}`,
          );
        }

        const degraded = grounded.reply === FAILURE_REPLY;
        const kept = !grounded.blocked && !degraded;
        // A reply pointing at "the payment page:" gets the real page a tool returned.
        const finished = kept ? completePaymentLink(grounded.reply, paymentPagesFrom(run.toolResults)) : grounded.reply;
        // Photos belong to the reply that hands them over; shown under it in the widget.
        const photos = kept ? run.photos : [];
        const reply = await answer(finished, photos.map((photo) => photo.path));
        // The same record as WhatsApp, so the next turn knows where "more" carries on.
        const note = photoNote(photos);
        if (note) await answer(note);
        return { guestMessage, reply };
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
    .mutation(async ({ input }) => {
      // A WhatsApp thread's reply has to go out on WhatsApp first; it is only
      // saved once it did, so the inbox never shows a message the guest never got.
      if (isWhatsappSession(input.sessionId)) {
        try {
          await deliverWhatsappReply(
            { sessionId: input.sessionId, content: input.content },
            { url: env.AGENT_URL, apiKey: env.AGENT_API_KEY },
          );
        } catch (error) {
          if (error instanceof AgentDeliveryError) {
            throw new TRPCError({
              code: error.code === "NOT_CONFIGURED" ? "PRECONDITION_FAILED" : "BAD_GATEWAY",
              message: error.message,
              cause: error,
            });
          }
          throw error;
        }
      }
      return appendChatMessage({
        sessionId: input.sessionId,
        propertyId: input.propertyId,
        sender: "admin",
        content: input.content,
      });
    }),
});
