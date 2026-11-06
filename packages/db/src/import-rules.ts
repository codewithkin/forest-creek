// Import-free so it can be unit tested without a database or env.

/**
 * Reading a bookings spreadsheet (the lodge's "CONFIRMED BOOKINGS" sheet,
 * copied from Excel or saved as CSV) into bookings. Every rule here is pure:
 * booking-import.ts feeds it the rooms and writes what it decides.
 */

export const importFields = ["guest", "arrive", "leave", "rooms", "status", "total", "notes", "ignore"] as const;
export type ImportField = (typeof importFields)[number];

/** Excel copies as tab-separated; a saved CSV uses commas (with quotes). Empty rows are dropped. */
export function parseTable(text: string): string[][] {
  const normalised = text.replace(/\r\n?/g, "\n");
  const firstLine = normalised.split("\n").find((line) => line.trim()) ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < normalised.length; index++) {
    const char = normalised[index]!;
    if (quoted) {
      if (char === '"' && normalised[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((candidate) => candidate.some((value) => value !== ""));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (value: number) => String(value).padStart(2, "0");
const fullYear = (year: number) => (year < 100 ? 2000 + year : year);

/**
 * A date as the sheet writes it: "13-Nov-26", "13 Nov 2026", "13/11/2026"
 * (day first, as in Zimbabwe), "2026-11-13", or an Excel serial (46339).
 * YYYY-MM-DD, or undefined if it isn't a date.
 */
export function parseSheetDate(raw: string): string | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return undefined;
  let day: number;
  let month: number;
  let year: number;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = text.match(/^(\d{1,2})[-\s/.]([a-z]{3,9})[-\s/.,]*(\d{2,4})$/))) {
    const index = MONTHS.indexOf(match[2]!.slice(0, 3));
    if (index === -1) return undefined;
    [day, month, year] = [Number(match[1]), index + 1, fullYear(Number(match[3]))];
  } else if ((match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    [day, month, year] = [Number(match[1]), Number(match[2]), fullYear(Number(match[3]))];
  } else if (/^\d{5}$/.test(text)) {
    // Excel's day count from 30 Dec 1899.
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000);
    return date.toISOString().slice(0, 10);
  } else return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "$5,200", "5200.00", "USD 720" → whole dollars. */
export function parseMoney(raw: string): number | undefined {
  const match = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(Number(match[1])) : undefined;
}

export type PaymentReading =
  | { kind: "none" }
  | { kind: "arrival" }
  | { kind: "record"; amount: number | "total"; method: "cash" | "bank_transfer"; note: string };

const BANK_WORDS = /\b(cbz|fbc|stanbic|steward|nmb|cabs|zb|bancabc|ecobank|first capital|bank|transfer|eft|rtgs|zipit|swipe)\b/i;

/**
 * What the status column says about money: "deposited CBZ $1200" is a $1200
 * bank deposit; "paid" is the whole stay; "pay on arrival" confirms with no
 * money; "to confirm" and blanks are unpaid. Bank names make it a transfer,
 * anything else cash.
 */
export function readPayment(...texts: string[]): PaymentReading {
  const text = texts.filter(Boolean).join(" ").trim();
  const lower = text.toLowerCase();
  if (!lower) return { kind: "none" };
  if (/pay(s|ing)? on arrival|on arrival/.test(lower)) return { kind: "arrival" };
  const method = BANK_WORDS.test(lower) ? "bank_transfer" : "cash";
  const deposit = lower.match(/(deposit(?:ed)?|paid|received)[^\d$]*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (deposit) return { kind: "record", amount: parseMoney(deposit[2]!)!, method, note: text };
  if (/\b(paid|settled|fully paid|paid in full)\b/.test(lower) && !/\bunpaid\b/.test(lower)) {
    return { kind: "record", amount: "total", method, note: text };
  }
  return { kind: "none" };
}

const HEADER_WORDS: Record<Exclude<ImportField, "ignore">, RegExp> = {
  guest: /^(guest|name|client|customer|booked by|who)/i,
  arrive: /^(arriv|check.?in|from|start|in$|date in)/i,
  leave: /^(leav|depart|check.?out|to$|end|out$|date out)/i,
  rooms: /^(room|unit|cottage|accommodation|what)/i,
  status: /^(status|payment|paid|deposit|confirm)/i,
  total: /^(total|amount|price|cost|value|\$)/i,
  notes: /^(note|comment|remark|extra|breakfast)/i,
};

/** Whether the first row names its columns rather than holding a booking. */
export function looksLikeHeader(row: string[]): boolean {
  const named = row.filter((cell) => Object.values(HEADER_WORDS).some((pattern) => pattern.test(cell.trim()))).length;
  return named >= 2 && !row.some((cell) => parseSheetDate(cell));
}

/**
 * Which column is which. From the header when there is one; otherwise from
 * what the columns hold: dates (the first is the arrival, the second the
 * departure), dollar amounts (the total), payment words (the status), room
 * names, and the first plain text column (the guest).
 */
export function guessColumns(rows: string[][], roomNames: string[] = []): ImportField[] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const fields: ImportField[] = Array.from({ length: width }, () => "ignore");
  const header = rows[0] && looksLikeHeader(rows[0]) ? rows[0] : undefined;
  if (header) {
    header.forEach((cell, index) => {
      const match = (Object.entries(HEADER_WORDS) as [ImportField, RegExp][]).find(([field, pattern]) => pattern.test(cell.trim()) && !fields.includes(field));
      if (match) fields[index] = match[0];
    });
    return fields;
  }
  const body = rows.slice(0, 60);
  const share = (index: number, test: (cell: string) => boolean) => {
    const filled = body.map((row) => row[index] ?? "").filter((cell) => cell.trim());
    return filled.length ? filled.filter(test).length / filled.length : 0;
  };
  const roomPattern = roomNames.length ? new RegExp(`\\b(${roomNames.map((name) => name.split(/\s+/)[0]!.replace(/[^\w]/g, "")).filter(Boolean).join("|")}|rooms?|couples?)\\b`, "i") : /\b(rooms?|couples?)\b/i;
  const isPayment = (cell: string) => /deposit|paid|confirm|arrival|pending/i.test(cell);
  const isMoney = (cell: string) => /^\s*(usd\s*)?\$?\s*[\d,]+(\.\d+)?\s*$/i.test(cell) && parseMoney(cell)! > 0;
  const dateColumns: number[] = [];
  for (let index = 0; index < width; index++) {
    if (share(index, (cell) => Boolean(parseSheetDate(cell))) >= 0.6) dateColumns.push(index);
  }
  if (dateColumns[0] !== undefined) fields[dateColumns[0]] = "arrive";
  if (dateColumns[1] !== undefined) fields[dateColumns[1]] = "leave";
  const free = (index: number) => fields[index] === "ignore";
  const pick = (field: ImportField, test: (cell: string) => boolean, threshold = 0.5) => {
    let best = -1;
    let bestShare = threshold;
    for (let index = 0; index < width; index++) {
      if (!free(index)) continue;
      const value = share(index, test);
      // A tie goes to the left-most column: names come first on the sheet.
      if (best === -1 ? value >= bestShare : value > bestShare) [best, bestShare] = [index, value];
    }
    if (best >= 0) fields[best] = field;
  };
  pick("status", isPayment, 0.4);
  pick("total", isMoney, 0.5);
  pick("rooms", (cell) => roomPattern.test(cell), 0.4);
  pick("guest", (cell) => /^[a-z][a-z .'&-]+$/i.test(cell.trim()) && !isPayment(cell), 0.5);
  pick("notes", (cell) => cell.trim().length > 0, 0.2);
  return fields;
}

export type CatalogRoom = { id: string; name: string; propertyId: string; propertyName: string; capacity: number };

export type RoomReading = { roomIds: string[]; warnings: string[]; unmatched: string[] };

const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const wordsOf = (value: string) => normal(value).split(" ").filter(Boolean);
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * The rooms a cell names. Understands a list of room names ("Caraway,
 * Parsley, Mint"), a room with its property ("Ginger Lillian"), whole
 * properties ("All rooms Vumba+Chikanga"), a count at a property ("6 rooms
 * Lillian House") and a count of a kind ("2 Family Rooms"). Room names are
 * preferred at the property in view. What it can't place is returned as
 * unmatched, never guessed.
 */
export function readRooms(cell: string, catalog: readonly CatalogRoom[], preferPropertyId?: string): RoomReading {
  const warnings: string[] = [];
  const unmatched: string[] = [];
  const chosen: string[] = [];
  const add = (room: CatalogRoom) => {
    if (!chosen.includes(room.id)) chosen.push(room.id);
  };
  const properties = [...new Map(catalog.map((room) => [room.propertyId, room.propertyName])).entries()];
  const propertiesIn = (text: string) =>
    properties.filter(([, name]) => wordsOf(name).some((word) => word.length > 3 && !["house", "lodge", "creek", "forest", "cottages", "cottage", "bnb"].includes(word) && wordsOf(text).includes(word)));
  const ranked = (rooms: CatalogRoom[], text?: string) => {
    const hinted = text ? propertiesIn(text).map(([id]) => id) : [];
    return [...rooms].sort((a, b) => {
      const score = (room: CatalogRoom) => (hinted.includes(room.propertyId) ? 0 : room.propertyId === preferPropertyId ? 1 : 2);
      return score(a) - score(b);
    });
  };

  const text = normal(cell);
  if (!text) return { roomIds: [], warnings, unmatched: [] };

  // "All rooms Vumba+Chikanga": every room at each named property.
  if (/\ball rooms?\b|\bwhole (house|property|lodge)\b/.test(text)) {
    const named = propertiesIn(cell);
    if (named.length === 0) unmatched.push(cell);
    for (const [propertyId] of named) catalog.filter((room) => room.propertyId === propertyId).forEach(add);
    return { roomIds: chosen, warnings, unmatched };
  }

  // "6 rooms Lillian House" / "2 Family Rooms": a count, of a kind or at a place.
  const counted = text.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(.*?)\s*rooms?\b\s*(.*)$/);
  if (counted) {
    const count = Number(counted[1]) || NUMBER_WORDS[counted[1]!] || 0;
    const kind = counted[2]!.trim();
    const place = counted[3]!.trim();
    let pool = catalog.slice();
    if (place) {
      const named = propertiesIn(place);
      if (named.length) pool = pool.filter((room) => named.some(([id]) => id === room.propertyId));
    }
    if (kind) pool = pool.filter((room) => normal(room.name).includes(kind));
    pool = ranked(pool, cell);
    if (pool.length < count || count === 0) {
      unmatched.push(cell);
      return { roomIds: [], warnings, unmatched };
    }
    pool.slice(0, count).forEach(add);
    warnings.push(`"${cell}" doesn't say which rooms: picked ${pool.slice(0, count).map((room) => room.name).join(", ")}`);
    return { roomIds: chosen, warnings, unmatched };
  }

  // A list of names, each perhaps with its property: "Ginger Lillian", "Mint, Oregon, Basil".
  for (const part of cell.split(/,|\+|&|\/|\band\b|;/i).map((piece) => piece.trim()).filter(Boolean)) {
    const words = wordsOf(part);
    const candidates = catalog.filter((room) => {
      const name = wordsOf(room.name);
      return name.length > 0 && name.every((word) => words.includes(word) || words.some((typed) => typed.length >= 4 && word.startsWith(typed)));
    });
    // A longer name beats a shorter one it contains ("Family Room 2" over "Family Room").
    const best = ranked(candidates, part).sort((a, b) => wordsOf(b.name).length - wordsOf(a.name).length)[0];
    if (best) add(best);
    else if (!/^\d+\s*(adults?|guests?|people|pax|kids|children)$/.test(normal(part))) unmatched.push(part);
  }
  return { roomIds: chosen, warnings, unmatched };
}

/** "Cayenne 3 adults", "10 Couples": how many people, when the sheet says. */
export function readPeople(...texts: string[]): number | undefined {
  const text = normal(texts.join(" "));
  const adults = text.match(/(\d+)\s*(adults?|guests?|people|pax)/);
  if (adults) return Number(adults[1]);
  const couples = text.match(/(\d+)\s*couples?/);
  if (couples) return Number(couples[1]) * 2;
  return undefined;
}
