import { z } from "zod";

import { addDays } from "./booking-policy";
import { toStayDate } from "./bookings";
import { prisma } from "./client";
import { describeError } from "./log";
import { createGroupBooking } from "./group-bookings";
import {
  guessColumns,
  importFields,
  looksLikeHeader,
  parseMoney,
  parseSheetDate,
  parseTable,
  readPayment,
  readPeople,
  readRooms,
  type CatalogRoom,
  type ImportField,
  type PaymentReading,
} from "./import-rules";

export * from "./import-rules";

/**
 * Moving the lodge's bookings spreadsheet into the system. preview reads it
 * and says what each row would become, problems and all; importBookings makes
 * exactly that, row by row, through the group booking path (so a stated total
 * is kept exactly and deposits get receipts). A row already in the system
 * (same guest, arrival and room) is never made twice.
 */

export const importInputSchema = z.object({
  text: z.string().min(1, "Paste the rows first").max(500_000),
  /** What each column holds; worked out from the sheet when absent. */
  fields: z.array(z.enum(importFields)).max(40).optional(),
  /** Rooms are matched here first when a name exists at several properties. */
  propertyId: z.string().min(1).optional(),
  /** Rooms chosen by hand for a row (by its number), when the sheet's words didn't match. */
  overrides: z.record(z.string(), z.array(z.string().min(1)).max(80)).default({}),
  /** Rows (by number) to leave out. */
  skip: z.array(z.number().int().min(0)).max(5000).default([]),
});

export type ImportInput = z.input<typeof importInputSchema>;

export type ImportRow = {
  /** Its number in the pasted rows, from 0, header excluded. */
  index: number;
  cells: string[];
  guest: string;
  arrive: string | null;
  leave: string | null;
  rooms: { id: string; name: string; propertyName: string; capacity: number }[];
  guests: number;
  /** The total the sheet states, kept exactly; the calendar prices it when absent. */
  total: number | null;
  payment: PaymentReading;
  notes: string;
  /** Why it can't be imported as it stands. */
  problems: string[];
  /** What was decided for it, for a person to check. */
  warnings: string[];
  /** An existing booking it repeats. */
  duplicateOf: string | null;
  skipped: boolean;
};

async function catalogFor(propertyIds?: string[]): Promise<CatalogRoom[]> {
  const rooms = await prisma.room.findMany({
    where: { active: true, ...(propertyIds ? { propertyId: { in: propertyIds } } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, capacity: true, propertyId: true, property: { select: { name: true } } },
  });
  return rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity, propertyId: room.propertyId, propertyName: room.property.name }));
}

export async function previewImport(input: ImportInput, propertyIds?: string[]) {
  const data = importInputSchema.parse(input);
  const catalog = await catalogFor(propertyIds);
  const table = parseTable(data.text);
  const hasHeader = table[0] ? looksLikeHeader(table[0]) : false;
  const body = hasHeader ? table.slice(1) : table;
  const fields: ImportField[] = data.fields ?? guessColumns(table, catalog.map((room) => room.name));
  const byId = new Map(catalog.map((room) => [room.id, room]));
  const at = (cells: string[], field: ImportField) => {
    const index = fields.indexOf(field);
    return index === -1 ? "" : (cells[index] ?? "").trim();
  };

  const rows: ImportRow[] = body.map((cells, index) => {
    const problems: string[] = [];
    const warnings: string[] = [];
    const guest = at(cells, "guest");
    const arrive = parseSheetDate(at(cells, "arrive")) ?? null;
    let leave = parseSheetDate(at(cells, "leave")) ?? null;
    const roomsCell = at(cells, "rooms");
    const notes = at(cells, "notes");

    if (!guest) problems.push("No guest name");
    if (!arrive) problems.push(at(cells, "arrive") ? `"${at(cells, "arrive")}" isn't a date` : "No arrival date");
    if (arrive && !leave) {
      leave = addDays(arrive, 1);
      warnings.push("No departure date: one night assumed");
    }
    if (arrive && leave && leave <= arrive) problems.push("The departure is before the arrival");

    const override = data.overrides[String(index)];
    let roomIds: string[];
    if (override?.length) {
      roomIds = override.filter((id) => byId.has(id));
      if (roomIds.length !== override.length) problems.push("A chosen room no longer exists");
    } else {
      const reading = readRooms(roomsCell, catalog, data.propertyId);
      roomIds = reading.roomIds;
      warnings.push(...reading.warnings);
      if (reading.unmatched.length) problems.push(`Couldn't find a room for "${reading.unmatched.join('", "')}": choose the rooms`);
      else if (roomIds.length === 0) problems.push("No room named: choose the rooms");
    }

    const rooms = roomIds.map((id) => byId.get(id)!).filter(Boolean);
    const people = readPeople(roomsCell, notes);
    const capacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
    const guests = rooms.length === 1 ? Math.min(rooms[0]!.capacity, people ?? 2) : Math.min(capacity, people ?? capacity);
    if (people && people > capacity && rooms.length) warnings.push(`${people} people, but the rooms chosen sleep ${capacity}`);

    const totalText = at(cells, "total");
    const total = totalText ? (parseMoney(totalText) ?? null) : null;
    const payment = readPayment(at(cells, "status"), fields.includes("status") ? "" : notes);
    if (payment.kind === "record" && payment.amount !== "total" && total !== null && payment.amount > total) {
      problems.push(`$${payment.amount} paid is more than the $${total} total`);
    }

    return {
      index,
      cells,
      guest,
      arrive,
      leave,
      rooms: rooms.map((room) => ({ id: room.id, name: room.name, propertyName: room.propertyName, capacity: room.capacity })),
      guests: Math.max(1, guests),
      total,
      payment,
      notes,
      problems,
      warnings,
      duplicateOf: null,
      skipped: data.skip.includes(index),
    };
  });

  // Already in the system: the same guest arriving the same day in the same room.
  const dated = rows.filter((row) => row.arrive && row.rooms.length);
  if (dated.length) {
    const existing = await prisma.booking.findMany({
      where: {
        bookingStatus: { not: "cancelled" },
        checkIn: { in: [...new Set(dated.map((row) => toStayDate(row.arrive!)))] },
        roomId: { in: [...new Set(dated.flatMap((row) => row.rooms.map((room) => room.id)))] },
      },
      select: { reference: true, guestName: true, checkIn: true, roomId: true },
    });
    for (const row of dated) {
      const match = existing.find(
        (booking) =>
          booking.checkIn.toISOString().slice(0, 10) === row.arrive &&
          booking.guestName.trim().toLowerCase() === row.guest.trim().toLowerCase() &&
          row.rooms.some((room) => room.id === booking.roomId),
      );
      if (match) {
        row.duplicateOf = match.reference;
        row.problems.push(`Already in the system as ${match.reference}`);
      }
    }
  }

  return { fields, hasHeader, header: hasHeader ? table[0]! : null, rows };
}

/** The party over the rooms: each at least one guest and never more than it sleeps. */
export function spreadGuests(guests: number, rooms: readonly { capacity: number }[]): number[] {
  let remaining = guests;
  return rooms.map((room, index) => {
    const after = rooms.length - index - 1;
    const take = Math.max(1, Math.min(room.capacity, remaining - after));
    remaining -= take;
    return take;
  });
}

export type ImportResult = { index: number; guest: string; ok: boolean; references: string[]; groupRef: string | null; error?: string };

/**
 * Makes the bookings the preview showed, one row at a time: a row that fails
 * (its dates taken meanwhile) is reported and the rest carry on. Rows with
 * problems and rows staff skipped are left out.
 */
export async function importBookings(input: ImportInput, propertyIds: string[] | undefined, by: string): Promise<ImportResult[]> {
  const { rows } = await previewImport(input, propertyIds);
  const results: ImportResult[] = [];
  for (const row of rows) {
    if (row.skipped || row.problems.length) continue;
    try {
      const notes = ["Imported from the bookings spreadsheet", row.notes, row.payment.kind === "record" ? `Status: ${row.payment.note}` : ""].filter(Boolean).join(". ");
      const { groupRef, bookings } = await createGroupBooking(
        {
          rooms: spreadGuests(row.guests, row.rooms).map((guests, index) => ({ roomId: row.rooms[index]!.id, guests })),
          checkIn: row.arrive!,
          checkOut: row.leave!,
          guestName: row.guest,
          notes,
          source: "other",
          agreedTotal: row.total ?? undefined,
          rateNote: row.total ? "The price on the bookings spreadsheet" : undefined,
          payment:
            row.payment.kind === "record"
              ? { kind: "record", amount: row.payment.amount === "total" ? "all" : row.payment.amount, method: row.payment.method, note: row.payment.note }
              : { kind: row.payment.kind },
        },
        by,
      );
      results.push({ index: row.index, guest: row.guest, ok: true, references: bookings.map((booking) => booking.reference), groupRef });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error)) console.error(`[import] row ${row.index} failed: ${describeError(error)}`);
      results.push({ index: row.index, guest: row.guest, ok: false, references: [], groupRef: null, error: (error as Error).message });
    }
  }
  return results;
}
