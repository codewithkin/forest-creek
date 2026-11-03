import { beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  appendChatMessage,
  createInvoice,
  createLetter,
  createQuote,
  createRegistration,
  createRoom,
  createStaffBooking,
  eraseOperationalData,
  lodgeToday,
  prisma,
} from "./index";

/**
 * The erase wipes the WHOLE database's records, so it only ever runs against
 * a throwaway database named for it:
 *
 *   createdb forest_creek_erase_test
 *   DATABASE_URL=postgresql://…/forest_creek_erase_test pnpm exec prisma migrate deploy
 *   DATABASE_URL=postgresql://…/forest_creek_erase_test bun test src/erase.test.ts
 *
 * Anywhere else (the dev database, CI against it) it is skipped.
 */
const throwaway = (process.env.DATABASE_URL ?? "").includes("erase_test");

describe.skipIf(!throwaway)("erasing everything to start over", () => {
  // A clean slate each run: it is a throwaway database.
  beforeAll(async () => {
    await eraseOperationalData({ confirm: "ERASE", files: true });
    await prisma.property.deleteMany({ where: { slug: "erase-house" } });
  });

  test("bookings and their records go; the set-up stays; numbering starts again", async () => {
    const property = await prisma.property.create({
      data: { slug: "erase-house", name: "Erase House", tagline: "-", description: "-", location: "-", phone: "-", email: "e@example.com", heroImage: "/media/x.jpg", sortOrder: 1 },
    });
    const room = await createRoom({ propertyId: property.id, name: "Room", description: "-", pricePerNight: 100, capacity: 2, bedType: "-", images: ["/media/x.jpg"] });
    await prisma.roomBlock.create({ data: { roomId: room.id, startDate: new Date("2031-01-01"), endDate: new Date("2031-01-03"), reason: "Paint", createdBy: "x" } });
    const today = lodgeToday();
    const booking = await createStaffBooking(
      { roomId: room.id, checkIn: addDays(today, 5), checkOut: addDays(today, 7), guests: 2, guestName: "G", guestEmail: "g@example.com", source: "phone", payment: { kind: "record", amount: 50, method: "cash", note: "R" } },
      "staff@example.com",
    );
    await appendChatMessage({ sessionId: "whatsapp:263770000000", sender: "guest", content: "hi" });
    await createQuote({ propertyId: property.id, guestName: "Q", validUntil: addDays(today, 5), lines: [{ kind: "custom", description: "Hall", unitPrice: 10, quantity: 1 }] }, "s@example.com");
    await createInvoice({ propertyId: property.id, bookingId: booking.id, billedTo: "G", issuedOn: today, lines: [{ description: "Room", quantity: 1, unitPrice: 100 }] }, { email: "s@example.com" });
    await createRegistration({ propertyId: property.id, bookingId: booking.id, guestName: "G", adults: 1, roomName: "Room", checkIn: addDays(today, 5), checkOut: addDays(today, 7) }, { email: "s@example.com" });
    await createLetter({ propertyId: property.id, recipient: "X", subject: "S", body: "B", signerName: "N", letterDate: today }, "s@example.com");
    expect(await prisma.receipt.count()).toBeGreaterThan(0);

    // A typo in the phrase changes nothing.
    const refused = await eraseOperationalData({ confirm: "erase" as "ERASE" }).then(() => false, () => true);
    expect(refused).toBe(true);
    expect(await prisma.booking.count()).toBe(1);

    const { counts } = await eraseOperationalData({ confirm: "ERASE" });
    expect(counts.bookings).toBe(1);
    for (const count of [prisma.booking.count(), prisma.receipt.count(), prisma.notification.count(), prisma.bookingEvent.count(), prisma.chatMessage.count(), prisma.quote.count(), prisma.invoice.count(), prisma.guestRegistration.count(), prisma.letter.count()]) {
      expect(await count).toBe(0);
    }
    // The set-up is untouched.
    expect(await prisma.property.count({ where: { id: property.id } })).toBe(1);
    expect(await prisma.room.count({ where: { id: room.id } })).toBe(1);
    expect(await prisma.roomBlock.count({ where: { roomId: room.id } })).toBe(1);

    // Numbering starts again at 1.
    const invoice = await createInvoice({ propertyId: property.id, billedTo: "New", issuedOn: today, lines: [{ description: "Room", quantity: 1, unitPrice: 100 }] }, { email: "s@example.com" });
    expect(invoice.number).toBe(1);
  });

  test("chats, documents and files can be kept", async () => {
    await appendChatMessage({ sessionId: "whatsapp:263770000001", sender: "guest", content: "keep me" });
    const kept = await eraseOperationalData({ confirm: "ERASE", chats: false, documents: false });
    expect(kept.counts.chatMessages).toBeUndefined();
    expect(await prisma.chatMessage.count()).toBe(1);
    expect(await prisma.invoice.count()).toBe(1);
  });
});
