import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  createLetter,
  createRegistration,
  createRoom,
  createStaffBooking,
  deleteLetters,
  deleteRegistrations,
  getLetter,
  getRegistration,
  letterNumber,
  listLetters,
  listRegistrations,
  lodgeToday,
  prisma,
  REGISTRATION_CONDITIONS,
  registrationDraftFromBooking,
  registrationNumber,
  registrationsForBooking,
  updateLetter,
} from "./index";

/** Registration cards and letters, against the dev database on a throwaway property. */
const SLUG = "cards-letters-test";
const BY = { email: "cards-letters@example.com", name: "Sithembiso Ndlovu" };
let propertyId: string;
let roomId: string;

async function cleanup() {
  await prisma.guestRegistration.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.letter.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: { slug: SLUG, name: "Card House", tagline: "-", description: "-", location: "261 Rhine Farm, Lower Vumba", phone: "+263 1", email: "card@example.com", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  propertyId = property.id;
  roomId = (await createRoom({ propertyId, name: "Executive Room", description: "-", pricePerNight: 100, capacity: 4, bedType: "-", images: ["/media/x.jpg"] })).id;
});
afterAll(cleanup);

const signature = "data:image/png;base64,iVBORw0KGgo=";

describe("guest registration", () => {
  test("numbers like the paper book", () => {
    expect(registrationNumber(201)).toBe("REG-0201");
  });

  test("a card keeps the conditions as signed, counts the nights, and is signed by whoever is at the desk", async () => {
    const card = await createRegistration(
      { propertyId, guestName: "Mr Moyo", adults: 2, children: 1, childrenAges: "6", nationality: "Zimbabwean", idNumber: "63-123456A42", roomName: "Executive Room", checkIn: "2026-12-03", checkOut: "2026-12-06", paymentMethod: "cash", signature },
      BY,
    );
    const view = await getRegistration(card.id);
    expect(view).toMatchObject({ nights: 3, conditions: REGISTRATION_CONDITIONS, receptionist: "Sithembiso Ndlovu", childrenAges: "6", idNumber: "63-123456A42" });
    expect(view?.signedAt).not.toBeNull();
  });

  test("refuses a stay that ends before it starts, and anything that isn't a drawn signature", async () => {
    const base = { propertyId, guestName: "X", adults: 1, roomName: "R", checkIn: "2026-12-03", checkOut: "2026-12-03" };
    expect(createRegistration(base, BY)).rejects.toThrow("after the check-in");
    expect(createRegistration({ ...base, checkOut: "2026-12-04", signature: "javascript:alert(1)" }, BY)).rejects.toThrow("drawn image");
  });

  test("starts from a booking, links to it, and the list never shows identity numbers", async () => {
    const today = lodgeToday();
    const booking = await createStaffBooking(
      { roomId, checkIn: today, checkOut: addDays(today, 2), guests: 3, guestName: "Tariro Moyo", guestEmail: "tariro@example.com", guestPhone: "0771234567", source: "walk-in", payment: { kind: "record", amount: 100, method: "cash", note: "R1" } },
      BY.email,
    );
    const draft = await registrationDraftFromBooking(booking.id);
    expect(draft).toMatchObject({ guestName: "Tariro Moyo", adults: 3, roomName: "Executive Room", checkIn: today, phone: "0771234567", bookingId: booking.id });
    expect(draft.receiptNumber).toMatch(/^FCR-/);
    const card = await createRegistration({ ...draft, passportNumber: "FN123456" }, BY);
    expect((await registrationsForBooking(booking.id)).map((row) => row.id)).toEqual([card.id]);
    const rows = await listRegistrations({ search: "tariro" }, [propertyId]);
    expect(rows.map((row) => row.id)).toEqual([card.id]);
    expect(JSON.stringify(rows)).not.toContain("FN123456");
    expect(await listRegistrations({}, ["no-such-property"])).toEqual([]);
    expect(await deleteRegistrations([card.id])).toEqual({ deleted: 1 });
  });
});

describe("letters", () => {
  test("written, found, corrected and deleted", async () => {
    expect(letterNumber(4, new Date("2026-11-02T10:00:00Z"))).toBe("LTR-2026-0004");
    const letter = await createLetter(
      { propertyId, recipient: "To whom it may concern", subject: "Confirmation of stay", body: "This is to confirm…", signerName: "Sithembiso Ndlovu", signerTitle: "Reservations", letterDate: "2026-11-02" },
      BY.email,
    );
    expect((await getLetter(letter.id))?.closing).toBe("Yours faithfully");
    expect((await listLetters({ search: "confirmation" }, [propertyId])).map((row) => [row.id, row.to])).toEqual([[letter.id, "To whom it may concern"]]);
    await updateLetter(letter.id, { propertyId, recipient: "Mr Moyo\n12 Main Street\nMutare", subject: "Confirmation of stay", body: "Dear Mr Moyo", closing: "Yours sincerely", signerName: "S. Ndlovu", letterDate: "2026-11-03" });
    const after = await getLetter(letter.id);
    expect([after?.closing, after?.letterDate, after?.signerTitle]).toEqual(["Yours sincerely", "2026-11-03", null]);
    expect((await listLetters({}, [propertyId]))[0]?.to).toBe("Mr Moyo");
    expect(await deleteLetters([letter.id])).toEqual({ deleted: 1 });
  });
});
