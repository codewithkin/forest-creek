import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  acceptQuote,
  cancelQuote,
  createQuote,
  createRoom,
  createStaffBooking,
  declineQuote,
  duplicateQuote,
  expireQuotes,
  getPublicQuote,
  getQuote,
  getQuoteProblems,
  getQuoteStats,
  isRoomAvailable,
  listQuotes,
  markQuoteSent,
  markQuoteViewed,
  prepareQuoteSend,
  prisma,
  queueQuoteEmail,
  remindQuotes,
  updateQuote,
  type QuoteInput,
} from "./index";

/** Quotations, against the dev database on a throwaway property, years ahead. */
const SLUG = "quotes-test";
const BY = "manager@example.com";
let propertyId: string;
let roomId: string;
let otherRoomId: string;

const dayFromToday = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function cleanup() {
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: {
      slug: SLUG, name: "Quote House", tagline: "-", description: "-", location: "-", phone: "+263 1",
      email: "quote-house@example.com", heroImage: "/media/x.jpg", sortOrder: 999,
    },
  });
  propertyId = property.id;
  const room = (name: string) =>
    createRoom({ propertyId, name, description: "-", pricePerNight: 100, capacity: 4, bedType: "-", images: ["/media/x.jpg"] });
  roomId = (await room("Suite")).id;
  otherRoomId = (await room("Cottage")).id;
});
afterAll(cleanup);

function draft(checkIn: string, checkOut: string, extra: Partial<QuoteInput> = {}): QuoteInput {
  return {
    propertyId,
    guestName: "Tariro Moyo",
    guestEmail: "quote-guest@example.com",
    validUntil: dayFromToday(7),
    lines: [{ kind: "room", roomId, checkIn, checkOut, guests: 2, unitPrice: 90 }],
    ...extra,
  };
}

async function sent(input: QuoteInput) {
  const quote = await createQuote(input, BY);
  await markQuoteSent(quote.id, null);
  return quote;
}

const message = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "(did not reject)";
};

describe("writing a quotation", () => {
  test("freezes prices on the lines and totals them, less the discount", async () => {
    const quote = await createQuote(
      draft("2081-01-10", "2081-01-13", {
        lines: [
          { kind: "room", roomId, checkIn: "2081-01-10", checkOut: "2081-01-13", guests: 2, unitPrice: 90 },
          { kind: "custom", description: "Conference hall", unitPrice: 50, quantity: 2 },
        ],
        discount: 20,
        discountNote: "Group rate",
      }),
      BY,
    );
    expect(quote).toMatchObject({ status: "draft", subtotal: 370, discount: 20, total: 350 });
    const full = await getQuote(quote.id);
    expect(full?.lines.map((line) => line.amount)).toEqual([270, 100]);
    expect(full?.label).toMatch(/^FCQ-\d{4}-\d{6}$/);
  });

  test("refuses a room from elsewhere, an empty quotation and a discount above the total", async () => {
    expect(await message(createQuote(draft("2081-01-10", "2081-01-13", { lines: [] }), BY))).toContain("at least one line");
    expect(await message(createQuote(draft("2081-01-10", "2081-01-13", { discount: 9999 }), BY))).toContain("larger");
    const foreign = await prisma.room.findFirst({ where: { propertyId: { not: propertyId } } });
    if (foreign) {
      const lines = [{ kind: "room" as const, roomId: foreign.id, checkIn: "2081-01-10", checkOut: "2081-01-13", guests: 1, unitPrice: 90 }];
      expect(await message(createQuote(draft("2081-01-10", "2081-01-13", { lines }), BY))).toContain("not at this property");
    }
  });

  test("only a draft can be edited, and a duplicate starts a fresh draft", async () => {
    const quote = await sent(draft("2081-02-10", "2081-02-12"));
    expect(await message(updateQuote(quote.id, draft("2081-02-10", "2081-02-13")))).toContain("Only a draft");
    const copy = await duplicateQuote(quote.id, BY);
    expect(copy).toMatchObject({ status: "draft", total: quote.total });
    expect(await updateQuote(copy.id, draft("2081-02-10", "2081-02-13"))).toMatchObject({ total: 270 });
  });

  test("a draft isn't public, and the guest's view leaves out how staff handled it", async () => {
    const quote = await createQuote(draft("2081-03-10", "2081-03-12"), BY);
    expect(await getPublicQuote(quote.id)).toBeNull();
    await markQuoteSent(quote.id, null);
    const view = await getPublicQuote(quote.id);
    expect(view?.total).toBe(180);
    expect(JSON.stringify(view)).not.toContain(BY);
    await markQuoteViewed(quote.id);
    expect((await getPublicQuote(quote.id))?.status).toBe("viewed");
  });
});

describe("sending", () => {
  test("repeat sends each queue their own email", async () => {
    const quote = await sent(draft("2081-04-10", "2081-04-12"));
    expect(await queueQuoteEmail(quote.id, 1)).toBe(1);
    expect(await queueQuoteEmail(quote.id, 1)).toBe(0);
    expect(await queueQuoteEmail(quote.id, 2)).toBe(1);
    const rows = await prisma.notification.findMany({ where: { quoteId: quote.id } });
    expect(rows.map((row) => row.event).sort()).toEqual(["quote-sent:1", "quote-sent:2"]);
    expect(rows[0]?.body).toContain(`/quote/${quote.id}`);
  });

  test("a quotation past its date or already answered can't go out", async () => {
    const old = await createQuote(draft("2081-04-20", "2081-04-22", { validUntil: dayFromToday(-1) }), BY);
    expect(await message(prepareQuoteSend(old.id))).toContain("passed");
    const quote = await sent(draft("2081-04-24", "2081-04-26"));
    await cancelQuote(quote.id);
    expect(await message(prepareQuoteSend(quote.id))).toContain("cancelled");
  });
});

describe("accepting", () => {
  test("makes a booking at the quoted price, with deposit, which holds nothing until paid", async () => {
    const quote = await sent(draft("2081-05-10", "2081-05-13"));
    const { bookings } = await acceptQuote(quote.id);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      channel: "quote", quoteId: quote.id, roomRate: 90, subtotal: 270, totalAmount: 270, depositAmount: 135, bookingStatus: "pending",
    });
    expect(bookings[0]!.policyAcceptedAt).not.toBeNull();
    expect(await isRoomAvailable(roomId, "2081-05-10", "2081-05-13")).toBe(true);
    expect((await getPublicQuote(quote.id))?.bookings[0]?.reference).toBe(bookings[0]!.reference);
    const staff = await prisma.notification.findMany({ where: { quoteId: quote.id, event: "quote-accepted" } });
    expect(staff.map((row) => row.recipient)).toEqual(["quote-house@example.com"]);
  });

  test("two clicks at once make one booking", async () => {
    const quote = await sent(draft("2081-06-10", "2081-06-12"));
    await Promise.all([acceptQuote(quote.id), acceptQuote(quote.id), acceptQuote(quote.id)]);
    expect(await prisma.booking.count({ where: { quoteId: quote.id } })).toBe(1);
  });

  test("several rooms: one booking each, extras and discount on the first", async () => {
    const quote = await sent(
      draft("2081-07-10", "2081-07-12", {
        lines: [
          { kind: "room", roomId, checkIn: "2081-07-10", checkOut: "2081-07-12", guests: 2, unitPrice: 100 },
          { kind: "room", roomId: otherRoomId, checkIn: "2081-07-10", checkOut: "2081-07-12", guests: 2, unitPrice: 80 },
          { kind: "custom", description: "Airport transfer", unitPrice: 40, quantity: 1 },
        ],
        discount: 30,
      }),
    );
    const { bookings } = await acceptQuote(quote.id);
    const totals = bookings.map((booking) => [booking.roomName, booking.totalAmount, booking.activityNames]).sort();
    expect(totals).toEqual([
      ["Cottage", 160, []],
      ["Suite", 210, ["Airport transfer"]],
    ]);
    expect(bookings.reduce((sum, booking) => sum + booking.totalAmount, 0)).toBe(quote.total);
  });

  test("a room that has gone refuses everything, keeps it open, and tells staff", async () => {
    const quote = await sent(
      draft("2081-08-10", "2081-08-12", {
        lines: [
          { kind: "room", roomId: otherRoomId, checkIn: "2081-08-10", checkOut: "2081-08-12", guests: 2, unitPrice: 80 },
          { kind: "room", roomId, checkIn: "2081-08-10", checkOut: "2081-08-12", guests: 2, unitPrice: 100 },
        ],
      }),
    );
    await createStaffBooking(
      { roomId, checkIn: "2081-08-11", checkOut: "2081-08-13", guests: 2, guestName: "Paid First", source: "phone", payment: { kind: "arrival" } },
      BY,
    );
    expect(await message(acceptQuote(quote.id))).toContain("nothing has been booked");
    expect(await prisma.booking.count({ where: { quoteId: quote.id } })).toBe(0);
    expect((await getQuote(quote.id))?.status).toBe("sent");
    expect((await getQuoteProblems([propertyId])).map((problem) => problem.id)).toContain(quote.id);
    expect(await prisma.notification.count({ where: { quoteId: quote.id, audience: "staff" } })).toBe(1);
  });

  test("an out-of-date, declined or cancelled quotation can't be accepted", async () => {
    const lapsed = await sent(draft("2081-09-10", "2081-09-12", { validUntil: dayFromToday(-1) }));
    expect(await message(acceptQuote(lapsed.id))).toContain("expired");
    expect((await getPublicQuote(lapsed.id))?.status).toBe("expired");

    const declined = await sent(draft("2081-09-14", "2081-09-16"));
    await declineQuote({ id: declined.id, reason: "Found somewhere closer" });
    expect(await message(acceptQuote(declined.id))).toContain("declined");
    expect((await getQuote(declined.id))?.declineReason).toBe("Found somewhere closer");
  });

  test("a quotation with no room is accepted without a booking, for staff to arrange", async () => {
    const quote = await sent(draft("2081-10-10", "2081-10-12", { lines: [{ kind: "custom", description: "Garden wedding", unitPrice: 900, quantity: 1 }] }));
    const { bookings } = await acceptQuote(quote.id);
    expect(bookings).toEqual([]);
    expect((await getQuote(quote.id))?.status).toBe("accepted");
  });
});

describe("the sweeper", () => {
  test("closes lapsed quotations and nudges once before they lapse", async () => {
    const lapsed = await sent(draft("2082-01-10", "2082-01-12", { validUntil: dayFromToday(-1) }));
    const soon = await sent(draft("2082-02-10", "2082-02-12", { validUntil: dayFromToday(2) }));
    expect(await expireQuotes()).toBeGreaterThanOrEqual(1);
    expect((await getQuote(lapsed.id))?.status).toBe("expired");
    expect((await getQuote(soon.id))?.status).toBe("sent");

    await remindQuotes();
    await remindQuotes();
    expect(await prisma.notification.count({ where: { quoteId: soon.id, event: "quote-reminder" } })).toBe(1);
  });
});

describe("the list", () => {
  test("finds by name or number and stays in scope; stats count the open pipeline", async () => {
    const quote = await sent(draft("2082-03-10", "2082-03-12", { guestName: "Rumbidzai Findable" }));
    expect((await listQuotes({ search: "findable", propertyIds: [propertyId] })).map((row) => row.id)).toEqual([quote.id]);
    expect((await listQuotes({ search: String(quote.number), propertyIds: [propertyId] })).map((row) => row.id)).toEqual([quote.id]);
    expect(await listQuotes({ search: "findable", propertyIds: ["someone-else"] })).toEqual([]);
    const stats = await getQuoteStats([propertyId]);
    expect(stats.openCount).toBeGreaterThan(0);
    expect(stats.acceptanceRate).toBeGreaterThan(0);
  });
});
