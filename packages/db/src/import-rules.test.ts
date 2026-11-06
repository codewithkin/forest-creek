import { describe, expect, test } from "bun:test";

import { guessColumns, looksLikeHeader, parseMoney, parseSheetDate, parseTable, readPayment, readPeople, readRooms, type CatalogRoom } from "./import-rules";

/** Rows as the lodge's "CONFIRMED BOOKINGS" sheet has them, copied out of Excel. */
const SHEET = [
  "Vivian Chiridza\t13-Nov-26\t14-Nov-26\tGinger Lillian\tpaid\t$120\tBreakfast included",
  "Chiltret Trust\t30-Nov-26\t2-Dec-26\tAll rooms Vumba+Chikanga\tto confirm\t$5,200\tGave quotation",
  "CBZ Trish\t5-Dec-26\t6-Dec-26\t20 Couples\tdeposited CBZ  $1200\t\tBreakfast included",
  "Sandra Chikati Mapuke\t23-Dec-26\t27-Dec-26\tRosemary\tdeposited $270 FBC\t$720\tBalance 450",
  "Miranda Masawi\t23-Dec-26\t27-Dec-26\tCayenne 3 adults\tdeposited $350\t$720\tBalance 370",
  "Betha Kufeni\t27-Dec-26\t30-Dec-26\tCaraway, Parsley,Mint, Oregon\tdeposited CBZ $1200\t$2,610\tPaid 1200",
  "Tafandashe Chikuku\t24-Dec-26\t27-Dec-26\t6 rooms Lillian House\tdeposited 1080\t$2,160\tbalance",
  "Mr Matthew\t4-Nov-26\t10-Nov-26\tAll rooms Vumba\tto confirm\t\tpay on arrival",
].join("\n");

const catalog: CatalogRoom[] = [
  ...["Caraway", "Parsley", "Mint", "Oregon", "Rosemary", "Cayenne", "Family Room"].map((name, index) => ({
    id: `v${index}`,
    name,
    propertyId: "vumba",
    propertyName: "Forest Creek Vumba",
    capacity: name === "Family Room" ? 4 : 2,
  })),
  ...["Ginger", "Basil", "Thyme", "Fennel", "Cinnamon", "Lillian 6", "Lillian 7"].map((name, index) => ({
    id: `l${index}`,
    name,
    propertyId: "lillian",
    propertyName: "Lillian House",
    capacity: 2,
  })),
  { id: "c0", name: "Chikanga Suite", propertyId: "chikanga", propertyName: "Forest Creek Chikanga", capacity: 2 },
];

describe("reading the sheet", () => {
  test("Excel's copy is tab-separated; a saved CSV may quote commas", () => {
    expect(parseTable(SHEET)).toHaveLength(8);
    expect(parseTable('Name,Rooms\n"Betha, K","Mint, Basil"\n\n')).toEqual([
      ["Name", "Rooms"],
      ["Betha, K", "Mint, Basil"],
    ]);
  });

  test("dates as the sheet writes them, day first", () => {
    expect(parseSheetDate("13-Nov-26")).toBe("2026-11-13");
    expect(parseSheetDate("2-Dec-26")).toBe("2026-12-02");
    expect(parseSheetDate("13/11/2026")).toBe("2026-11-13");
    expect(parseSheetDate("2026-11-13")).toBe("2026-11-13");
    expect(parseSheetDate("46339")).toBe("2026-11-13");
    expect(parseSheetDate("31-Feb-26")).toBeUndefined();
    expect(parseSheetDate("to confirm")).toBeUndefined();
  });

  test("money and people", () => {
    expect(parseMoney("$5,200")).toBe(5200);
    expect(parseMoney("")).toBeUndefined();
    expect(readPeople("Cayenne 3 adults")).toBe(3);
    expect(readPeople("20 Couples")).toBe(40);
  });

  test("payments: deposits with their bank, paid, on arrival, and unpaid", () => {
    expect(readPayment("deposited CBZ  $1200")).toEqual({ kind: "record", amount: 1200, method: "bank_transfer", note: "deposited CBZ  $1200" });
    expect(readPayment("deposited $350")).toMatchObject({ kind: "record", amount: 350, method: "cash" });
    expect(readPayment("deposited 1080")).toMatchObject({ kind: "record", amount: 1080 });
    expect(readPayment("paid")).toMatchObject({ kind: "record", amount: "total" });
    expect(readPayment("to confirm", "pay on arrival")).toEqual({ kind: "arrival" });
    expect(readPayment("To be confirmed")).toEqual({ kind: "none" });
    expect(readPayment("")).toEqual({ kind: "none" });
  });

  test("columns are worked out from what they hold when there's no header", () => {
    expect(guessColumns(parseTable(SHEET), catalog.map((room) => room.name))).toEqual(["guest", "arrive", "leave", "rooms", "status", "total", "notes"]);
  });

  test("with only a couple of rows, the left-most text column is still the guest", () => {
    const rows = parseTable(
      ["UI Import Guest\t13-Nov-31\t15-Nov-31\tCaraway\tdeposited CBZ $100\t$300\tBreakfast", "UI Party\t20-Nov-31\t21-Nov-31\tMint\tto confirm\t\t"].join("\n"),
    );
    expect(guessColumns(rows, catalog.map((room) => room.name))).toEqual(["guest", "arrive", "leave", "rooms", "status", "total", "notes"]);
  });

  test("a header row names the columns", () => {
    const rows = parseTable("Guest\tCheck in\tCheck out\tRoom\tStatus\tTotal\n" + SHEET);
    expect(looksLikeHeader(rows[0]!)).toBe(true);
    // The data has a seventh column the header doesn't name: left out.
    expect(guessColumns(rows)).toEqual(["guest", "arrive", "leave", "rooms", "status", "total", "ignore"]);
  });
});

describe("reading the rooms", () => {
  const names = (cell: string, prefer?: string) => readRooms(cell, catalog, prefer).roomIds.map((id) => catalog.find((room) => room.id === id)!.name);

  test("a list of names, a name with its property, and whole properties", () => {
    expect(names("Caraway, Parsley,Mint, Oregon")).toEqual(["Caraway", "Parsley", "Mint", "Oregon"]);
    expect(names("Ginger Lillian")).toEqual(["Ginger"]);
    expect(names("Mint, Oregon, Basil")).toEqual(["Mint", "Oregon", "Basil"]);
    expect(names("All rooms Vumba+Chikanga")).toHaveLength(8);
    expect(names("Cayenne 3 adults")).toEqual(["Cayenne"]);
  });

  test("a count at a property picks that many there, and says so", () => {
    const reading = readRooms("6 rooms Lillian House", catalog);
    expect(reading.roomIds).toHaveLength(6);
    expect(reading.roomIds.every((id) => id.startsWith("l"))).toBe(true);
    expect(reading.warnings[0]).toContain("doesn't say which rooms");
  });

  test("what it can't place is left for a person, never guessed", () => {
    expect(readRooms("Garden bday", catalog)).toEqual({ roomIds: [], warnings: [], unmatched: ["Garden bday"] });
    expect(readRooms("20 Couples", catalog).roomIds).toEqual([]);
  });
});
