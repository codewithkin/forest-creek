import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createRoom, importBookings, previewImport, prisma, spreadGuests } from "./index";

/** The spreadsheet import, end to end, against the dev database on throwaway properties. */
const SLUGS = ["import-test-vumba", "import-test-lillian"] as const;
const BY = "import@example.com";
let scope: string[] = [];

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { property: { slug: { in: [...SLUGS] } } } } });
  await prisma.booking.deleteMany({ where: { property: { slug: { in: [...SLUGS] } } } });
  await prisma.property.deleteMany({ where: { slug: { in: [...SLUGS] } } });
}

beforeAll(async () => {
  await cleanup();
  const make = async (slug: string, name: string, rooms: string[]) => {
    const property = await prisma.property.create({
      data: { slug, name, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
    });
    for (const room of rooms) await createRoom({ propertyId: property.id, name: room, description: "-", pricePerNight: 150, capacity: 2, bedType: "-", images: ["/media/x.jpg"] });
    return property.id;
  };
  scope = [await make(SLUGS[0], "Import Vumba", ["Caraway", "Parsley", "Mint", "Oregon", "Rosemary"]), await make(SLUGS[1], "Import Lillian", ["Ginger", "Basil"])];
});
afterAll(cleanup);

// Dates in 2031, so nothing real is in the way.
const SHEET = [
  "Vivian Chiridza\t13-Nov-31\t14-Nov-31\tGinger Lillian\tpaid\t$120\tBreakfast included",
  "Betha Kufeni\t27-Dec-31\t30-Dec-31\tCaraway, Parsley,Mint, Oregon\tdeposited CBZ $1200\t$2,610\tPaid 1200",
  "Sandra Mapuke\t23-Dec-31\t27-Dec-31\tRosemary\tto confirm\t$720\t",
  "Garden party\t1-Nov-31\t\tGarden bday\t\t\t",
].join("\n");

describe("the bookings spreadsheet import", () => {
  test("the party is spread over the rooms, never more than one sleeps", () => {
    expect(spreadGuests(7, [{ capacity: 2 }, { capacity: 4 }, { capacity: 2 }])).toEqual([2, 4, 1]);
    expect(spreadGuests(1, [{ capacity: 2 }, { capacity: 2 }])).toEqual([1, 1]);
  });

  test("the preview reads every row and says what's wrong, before anything is made", async () => {
    const { fields, rows } = await previewImport({ text: SHEET }, scope);
    expect(fields.slice(0, 6)).toEqual(["guest", "arrive", "leave", "rooms", "status", "total"]);
    expect(rows.map((row) => row.rooms.map((room) => room.name))).toEqual([["Ginger"], ["Caraway", "Parsley", "Mint", "Oregon"], ["Rosemary"], []]);
    expect(rows[1]!.payment).toMatchObject({ kind: "record", amount: 1200, method: "bank_transfer" });
    expect(rows[3]!.problems.join(" ")).toContain("Garden bday");
    expect(await prisma.booking.count({ where: { propertyId: { in: scope } } })).toBe(0);
  });

  test("importing makes exactly that: totals kept, deposits recorded, one group, the unmatched row left out", async () => {
    const results = await importBookings({ text: SHEET }, scope, BY);
    expect(results.map((result) => [result.guest, result.ok])).toEqual([
      ["Vivian Chiridza", true],
      ["Betha Kufeni", true],
      ["Sandra Mapuke", true],
    ]);
    const betha = await prisma.booking.findMany({ where: { guestName: "Betha Kufeni", propertyId: { in: scope } } });
    expect(betha).toHaveLength(4);
    expect(betha.reduce((sum, booking) => sum + booking.totalAmount, 0)).toBe(2610);
    expect(betha.reduce((sum, booking) => sum + booking.amountPaid, 0)).toBe(1200);
    expect(new Set(betha.map((booking) => booking.groupRef)).size).toBe(1);

    const vivian = await prisma.booking.findFirstOrThrow({ where: { guestName: "Vivian Chiridza", propertyId: { in: scope } } });
    expect([vivian.totalAmount, vivian.amountPaid, vivian.paymentStatus, vivian.groupRef]).toEqual([120, 120, "verified", null]);

    const sandra = await prisma.booking.findFirstOrThrow({ where: { guestName: "Sandra Mapuke", propertyId: { in: scope } } });
    expect([sandra.totalAmount, sandra.amountPaid, sandra.bookingStatus]).toEqual([720, 0, "pending"]);
  });

  test("pasting the same sheet again makes nothing twice", async () => {
    const { rows } = await previewImport({ text: SHEET }, scope);
    expect(rows.slice(0, 3).every((row) => row.duplicateOf)).toBe(true);
    expect(await importBookings({ text: SHEET }, scope, BY)).toEqual([]);
  });

  test("rooms chosen by hand fix a row the sheet didn't name", async () => {
    const basil = await prisma.room.findFirstOrThrow({ where: { name: "Basil", propertyId: { in: scope } } });
    const results = await importBookings({ text: SHEET, overrides: { "3": [basil.id] }, skip: [0, 1, 2] }, scope, BY);
    expect(results).toEqual([expect.objectContaining({ guest: "Garden party", ok: true })]);
  });
});
