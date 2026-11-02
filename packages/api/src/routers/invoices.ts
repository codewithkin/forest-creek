import {
  createInvoice,
  getInvoice,
  getInvoiceStats,
  invoiceDraftFromBooking,
  InvoiceError,
  invoiceInputSchema,
  invoiceProperties,
  listInvoices,
  listInvoicesSchema,
  queueInvoiceEmail,
  setInvoicesPaid,
  voidInvoices,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertPropertyAccess, publicProcedure, router, scopeProperties, staffProcedure, type StaffScope } from "../index";

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof InvoiceError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

async function assertInvoicesAccess(staff: StaffScope, ids: string[]) {
  for (const propertyId of await guarded(() => invoiceProperties(ids))) assertPropertyAccess(staff, propertyId);
}

const ids = z.array(z.string().min(1)).min(1).max(500);

export const invoicesRouter = router({
  list: staffProcedure
    .input(listInvoicesSchema.extend({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => {
      const { propertyId, ...filters } = input;
      return listInvoices(filters, scopeProperties(ctx.staff, propertyId));
    }),

  stats: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => getInvoiceStats(scopeProperties(ctx.staff, input.propertyId))),

  byId: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    const invoice = await getInvoice(input);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "No such invoice" });
    assertPropertyAccess(ctx.staff, invoice.propertyId);
    return invoice;
  }),

  /** An invoice's starting point from a stay, for staff to check and issue. */
  fromBooking: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    const draft = await guarded(() => invoiceDraftFromBooking(input));
    assertPropertyAccess(ctx.staff, draft.propertyId);
    return draft;
  }),

  create: staffProcedure.input(invoiceInputSchema).mutation(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return guarded(() => createInvoice(input, { email: ctx.session.user.email, name: ctx.session.user.name }));
  }),

  email: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    await assertInvoicesAccess(ctx.staff, [input]);
    const result = await queueInvoiceEmail(input);
    if (!result.queued) throw new TRPCError({ code: "PRECONDITION_FAILED", message: result.problem ?? "It couldn't be sent." });
    return result;
  }),

  setPaid: staffProcedure.input(z.object({ ids, paid: z.boolean() })).mutation(async ({ ctx, input }) => {
    await assertInvoicesAccess(ctx.staff, input.ids);
    return setInvoicesPaid(input.ids, input.paid);
  }),

  void: staffProcedure.input(ids).mutation(async ({ ctx, input }) => {
    await assertInvoicesAccess(ctx.staff, input);
    return voidInvoices(input);
  }),

  // What the PDF link in the email reads. The id is unguessable, like a receipt's.
  view: publicProcedure.input(z.string().trim().min(1).max(64)).query(async ({ input }) => {
    const invoice = await getInvoice(input);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "No such invoice" });
    // Staff-only details stay off the public link.
    const { createdBy: _createdBy, sendCount: _sendCount, sentAt: _sentAt, email: _email, phone: _phone, ...shown } = invoice;
    return shown;
  }),
});
