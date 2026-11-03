import { z } from "zod";

import { prisma } from "./client";
import { describeError } from "./log";

/**
 * "Erase everything and start over", for the owner: the business's records
 * go, its set-up stays. Erased: bookings with their payments, receipts,
 * history and emails, and (by choice) chats, documents, day-visit requests
 * and files. Kept: properties, rooms, prices by date, room blocks,
 * experiences, day-visit offers, photos, staff accounts and the WhatsApp link.
 *
 * One transaction: it all goes or none of it does. Can't be undone.
 */

export const ERASE_PHRASE = "ERASE";

export const eraseInputSchema = z.object({
  /** Typed by the owner, so it can't happen by a slip. */
  confirm: z.literal(ERASE_PHRASE, { error: `Type ${ERASE_PHRASE} to confirm` }),
  chats: z.boolean().default(true),
  /** Quotations, invoices, registration cards and letters. */
  documents: z.boolean().default(true),
  dayVisits: z.boolean().default(true),
  files: z.boolean().default(false),
  /** Quotation, invoice, receipt, card and letter numbers start again at 1. */
  restartNumbers: z.boolean().default(true),
});

export type EraseInput = z.input<typeof eraseInputSchema>;

export type EraseResult = {
  counts: Record<string, number>;
  /** R2 objects whose records went: packages/api deletes them after the transaction. */
  fileKeys: string[];
};

/** The numbered tables, and whether this erase empties them. */
const NUMBERED = [
  { table: "receipt", when: () => true },
  { table: "quote", when: (data: z.output<typeof eraseInputSchema>) => data.documents },
  { table: "invoice", when: (data: z.output<typeof eraseInputSchema>) => data.documents },
  { table: "guest_registration", when: (data: z.output<typeof eraseInputSchema>) => data.documents },
  { table: "letter", when: (data: z.output<typeof eraseInputSchema>) => data.documents },
] as const;

export async function eraseOperationalData(input: EraseInput): Promise<EraseResult> {
  const data = eraseInputSchema.parse(input);
  const fileKeys = data.files ? (await prisma.storedFile.findMany({ select: { key: true } })).map((file) => file.key) : [];

  const counts = await prisma.$transaction(
    async (tx) => {
      const counts: Record<string, number> = {};
      const run = async (name: string, action: Promise<{ count: number }>) => {
        counts[name] = (await action).count;
      };
      // Children first, so nothing is left pointing at a booking that has gone.
      await run("emails", tx.notification.deleteMany({}));
      await run("paymentEvents", tx.paymentEvent.deleteMany({}));
      await run("receipts", tx.receipt.deleteMany({}));
      await run("bookingHistory", tx.bookingEvent.deleteMany({}));
      await run("pendingConfirmations", tx.pendingConfirmation.deleteMany({}));
      if (data.files) {
        await run("shareLinks", tx.fileShare.deleteMany({}));
        await run("files", tx.storedFile.deleteMany({}));
        await tx.fileFolder.updateMany({ data: { parentId: null } });
        await run("folders", tx.fileFolder.deleteMany({}));
      }
      if (data.documents) {
        await run("invoices", tx.invoice.deleteMany({}));
        await run("registrationCards", tx.guestRegistration.deleteMany({}));
        await run("letters", tx.letter.deleteMany({}));
        await run("quotations", tx.quote.deleteMany({}));
      }
      if (data.dayVisits) await run("dayVisitRequests", tx.dayVisitBooking.deleteMany({}));
      if (data.chats) await run("chatMessages", tx.chatMessage.deleteMany({}));
      await run("bookings", tx.booking.deleteMany({}));

      if (data.restartNumbers) {
        for (const numbered of NUMBERED) {
          if (!numbered.when(data)) continue;
          // Table names come from the list above, never from input.
          await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${numbered.table}"', 'number'), 1, false)`);
        }
      }
      return counts;
    },
    { timeout: 120_000 },
  );
  return { counts, fileKeys };
}

/** Never throws: logs what failed, and says so in the total. */
export async function deleteObjects(keys: string[], remove: (key: string) => Promise<void>): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await remove(key);
      deleted++;
    } catch (error) {
      failed++;
      console.error(`[admin] could not delete a stored file after the erase: ${describeError(error)}`);
    }
  }
  return { deleted, failed };
}
