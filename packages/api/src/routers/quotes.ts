import {
  acceptQuote,
  appendChatMessage,
  cancelQuote,
  deleteQuotes,
  createQuote,
  declineQuote,
  declineQuoteSchema,
  duplicateQuote,
  getPublicQuote,
  getQuote,
  getQuoteStats,
  issueQuote,
  listQuotes,
  markQuoteSent,
  markQuoteViewed,
  prepareQuoteSend,
  priceRoomForQuote,
  QuoteError,
  queueQuoteEmail,
  quoteInputSchema,
  quoteStatuses,
  recordQuoteProblem,
  updateQuote,
  whatsappDigits,
} from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { env } from "@forest-creek/env/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { AgentDeliveryError, deliverWhatsappReply } from "../agent-client";
import { assertPropertyAccess, publicProcedure, rateLimitedProcedure, router, scopeProperties, staffProcedure } from "../index";

const codes: Record<QuoteError["code"], TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  NOT_EDITABLE: "CONFLICT",
  NOT_OPEN: "CONFLICT",
  EXPIRED: "CONFLICT",
  ROOM_GONE: "CONFLICT",
  NO_ROUTE: "PRECONDITION_FAILED",
  INVALID: "BAD_REQUEST",
};

function toTRPCError(error: unknown): never {
  if (error instanceof QuoteError) throw new TRPCError({ code: codes[error.code], message: error.message, cause: error });
  throw error;
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return toTRPCError(error);
  }
}

type Staff = Parameters<typeof assertPropertyAccess>[0];

async function assertQuoteAccess(staff: Staff, id: string) {
  const quote = await getQuote(id);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "No such quotation" });
  assertPropertyAccess(staff, quote.propertyId);
  return quote;
}

const MINUTE = 60_000;
const idOf = (input: unknown) => (typeof input === "object" && input !== null && "id" in input ? String((input as { id: unknown }).id) : undefined);
// A guest answers once or twice; a script guessing ids gets nowhere fast.
const answerLimited = rateLimitedProcedure("quote-answer", { limit: 10, windowMs: 10 * MINUTE }, idOf);

export const quotesRouter = router({
  list: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional(), status: z.enum(quoteStatuses).optional(), search: z.string().trim().max(120).optional() }))
    .query(({ ctx, input }) => {
      const { propertyId, ...filters } = input;
      return listQuotes({ ...filters, propertyIds: scopeProperties(ctx.staff, propertyId) });
    }),

  stats: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => getQuoteStats(scopeProperties(ctx.staff, input.propertyId))),

  byId: staffProcedure.input(z.string().min(1)).query(({ ctx, input }) => assertQuoteAccess(ctx.staff, input)),

  /** Starts a room line at the calendar's price for those dates. */
  priceRoom: staffProcedure
    .input(z.object({ roomId: z.string().min(1), checkIn: z.iso.date(), checkOut: z.iso.date() }))
    .query(({ input }) => guarded(() => priceRoomForQuote(input.roomId, input.checkIn, input.checkOut))),

  create: staffProcedure.input(quoteInputSchema).mutation(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return guarded(() => createQuote(input, ctx.session.user.email));
  }),

  update: staffProcedure.input(z.object({ id: z.string().min(1), quote: quoteInputSchema })).mutation(async ({ ctx, input }) => {
    await assertQuoteAccess(ctx.staff, input.id);
    assertPropertyAccess(ctx.staff, input.quote.propertyId);
    return guarded(() => updateQuote(input.id, input.quote));
  }),

  duplicate: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    await assertQuoteAccess(ctx.staff, input);
    return guarded(() => duplicateQuote(input, ctx.session.user.email));
  }),

  delete: staffProcedure.input(z.array(z.string().min(1)).min(1).max(200)).mutation(async ({ ctx, input }) => {
    for (const id of input) await assertQuoteAccess(ctx.staff, id);
    return deleteQuotes(input);
  }),

  cancel: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    await assertQuoteAccess(ctx.staff, input);
    return guarded(() => cancelQuote(input));
  }),

  /**
   * Sends by email, WhatsApp or both. One route failing doesn't stop the
   * other: staff are told exactly which went, and only if neither did does
   * the quotation stay unsent.
   */
  send: staffProcedure
    .input(z.object({ id: z.string().min(1), email: z.boolean(), whatsapp: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertQuoteAccess(ctx.staff, input.id);
      return guarded(async () => {
        const quote = await prepareQuoteSend(input.id);
        if (!input.email && !input.whatsapp) throw new QuoteError("Choose email, WhatsApp or both", "NO_ROUTE");
        const problems: string[] = [];
        let emailed = false;
        let whatsapped = false;

        if (input.email) {
          if (!quote.guestEmail) problems.push("There is no email address on this quotation.");
          else emailed = (await queueQuoteEmail(quote.id, quote.sendCount + 1)) > 0;
        }

        if (input.whatsapp) {
          const digits = quote.guestPhone ? whatsappDigits(quote.guestPhone) : undefined;
          if (!digits) {
            problems.push("There is no usable WhatsApp number on this quotation.");
          } else {
            const sessionId = `whatsapp:${digits}`;
            const content = `Hello ${quote.guestName.split(/\s+/)[0]}, here is your quotation ${quote.label} from Forest Creek for $${quote.total}. You can view and accept it here: ${quote.link}`;
            try {
              await deliverWhatsappReply({ sessionId, content }, { url: env.AGENT_URL, apiKey: env.AGENT_API_KEY });
              whatsapped = true;
              // In the thread, so the assistant and staff can see it was sent.
              await appendChatMessage({ sessionId, sender: "admin", content });
            } catch (error) {
              if (!(error instanceof AgentDeliveryError)) console.error(`[quotes] WhatsApp send failed: ${describeError(error)}`);
              problems.push(error instanceof AgentDeliveryError ? error.message : "WhatsApp could not send it.");
            }
          }
        }

        const problem = problems.join(" ") || null;
        if (!emailed && !whatsapped) {
          await recordQuoteProblem(quote.id, problem ?? "It could not be sent.");
          throw new QuoteError(problem ?? "It could not be sent.", "NO_ROUTE");
        }
        await markQuoteSent(quote.id, problem);
        return { emailed, whatsapped, problem };
      });
    }),

  /** Makes a draft's link and PDF live without sending it, for a quotation staff download. */
  issue: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    await assertQuoteAccess(ctx.staff, input);
    return guarded(() => issueQuote(input));
  }),

  // What the guest's link reads. The id is unguessable, like a receipt's.
  view: publicProcedure.input(z.string().trim().min(1).max(64)).query(async ({ input }) => {
    const quote = await getPublicQuote(input);
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "No such quotation" });
    return quote;
  }),

  markViewed: publicProcedure.input(z.object({ id: z.string().trim().min(1).max(64) })).mutation(async ({ input }) => {
    await markQuoteViewed(input.id);
    return { ok: true };
  }),

  accept: answerLimited
    .input(z.object({ id: z.string().trim().min(1).max(64), policyAccepted: z.literal(true, { error: "Please agree to the Booking & Cancellation Policy." }) }))
    .mutation(({ input }) =>
      guarded(async () => {
        const { bookings } = await acceptQuote(input.id);
        return { references: bookings.map((booking) => booking.reference) };
      }),
    ),

  decline: answerLimited.input(declineQuoteSchema).mutation(({ input }) =>
    guarded(async () => {
      await declineQuote(input);
      return { ok: true };
    }),
  ),
});
