/**
 * The last line of defence between the model and a guest. A booking reference
 * or bank detail the database cannot back must never be sent, however
 * confident the model sounds — a guest paying into an invented account is not
 * a recoverable mistake.
 *
 * Deliberately import-free, so evals and tests can use it without loading the
 * validated environment.
 */

// Looser than the real reference alphabet, so a hallucinated reference
// containing I, O, 0 or 1 is still caught and checked.
const REFERENCE_SHAPE = /\bFC-[A-Z0-9]{6}\b/gi;

export function extractReferences(text: string): string[] {
  const found = text.match(REFERENCE_SHAPE) ?? [];
  return [...new Set(found.map((reference) => reference.toUpperCase()))];
}

const PAYMENT_KEYWORDS =
  /\b(?:account\s*(?:no\.?|number|#|name)|acc\.?\s*no|swift|bic|iban|sort\s*code|routing\s*(?:no\.?|number)|branch\s*code)\b/i;

// The lodge's own contact numbers are fine to send; strip international
// numbers before looking for account-number-shaped digit runs.
const INTERNATIONAL_PHONE = /\+\d[\d\s-]{6,}\d/g;
const LONG_DIGIT_RUN = /\b\d(?: ?\d){7,}\b/g;

function digitTokens(text: string): string[] {
  const withoutPhones = text.replace(INTERNATIONAL_PHONE, " ");
  return (withoutPhones.match(LONG_DIGIT_RUN) ?? []).map((token) => token.replace(/\s/g, ""));
}

export function looksLikePaymentDetails(text: string): boolean {
  return PAYMENT_KEYWORDS.test(text) || digitTokens(text).length > 0;
}

export type CreatedBooking = {
  reference: string;
  property: string;
  room: string;
  checkIn: string;
  checkOut: string;
  totalAmountUsd: number;
};

export type IssuedPaymentRequest = {
  reference: string;
  amountUsd: number;
  instructions: string;
  paymentLink: string | null;
};

/** What the tools actually did this turn — the only facts a reply may lean on. */
export type ToolFacts = {
  bookings: CreatedBooking[];
  payments: IssuedPaymentRequest[];
};

type ToolEntry = { toolName?: string; result?: unknown };
type RawToolResult = ToolEntry & { payload?: ToolEntry };

const CREATE_BOOKING = new Set(["createBooking", "create-booking"]);
const REQUEST_PAYMENT = new Set(["requestPayment", "request-payment"]);

export function collectToolFacts(toolResults: unknown): ToolFacts {
  const facts: ToolFacts = { bookings: [], payments: [] };
  if (!Array.isArray(toolResults)) return facts;

  for (const raw of toolResults as RawToolResult[]) {
    // Mastra wraps each result in a payload; accept the flat shape too.
    const entry: ToolEntry = raw?.payload ?? raw;
    const name = entry?.toolName;
    const result = entry?.result as Record<string, unknown> | undefined;
    if (!name || !result || result.ok !== true) continue;

    const reference = result.reference;
    if (typeof reference !== "string") continue;

    if (CREATE_BOOKING.has(name)) {
      facts.bookings.push({
        reference: reference.toUpperCase(),
        property: String(result.property ?? ""),
        room: String(result.room ?? ""),
        checkIn: String(result.checkIn ?? ""),
        checkOut: String(result.checkOut ?? ""),
        totalAmountUsd: Number(result.totalAmountUsd ?? 0),
      });
    }

    if (REQUEST_PAYMENT.has(name)) {
      const link = result.paymentLink;
      facts.payments.push({
        reference: reference.toUpperCase(),
        amountUsd: Number(result.amountUsd ?? 0),
        instructions: String(result.instructions ?? ""),
        paymentLink: typeof link === "string" && link.length > 0 ? link : null,
      });
    }
  }

  return facts;
}

export type ReferenceLookup = (
  reference: string,
) => Promise<{ guestPhone: string | null } | null>;

export type GroundingInput = {
  reply: string;
  /** Null for an anonymous website visitor, who owns no bookings by phone. */
  guestPhone: string | null;
  guestMessage: string;
  facts: ToolFacts;
  lookupReference: ReferenceLookup;
};

export type GroundedReply =
  | { blocked: false; reply: string }
  | { blocked: true; reply: string; reason: string };

export const HANDOFF_REPLY =
  "Sorry — I couldn't complete that just now, so nothing has been booked or charged. The team at Forest Creek will pick this up with you shortly, or you can reach them on +263 71 234 5678.";

/**
 * Payment details in a reply are only acceptable when request-payment returned
 * real ones this turn, and every account-like number the model wrote appears
 * in what the lodge configured.
 */
function paymentDetailsAreBacked(reply: string, facts: ToolFacts): boolean {
  const configured = facts.payments.filter((payment) =>
    looksLikePaymentDetails(payment.instructions),
  );
  if (configured.length === 0) return false;

  const known = configured.map((payment) => payment.instructions.replace(/\s/g, ""));
  return digitTokens(reply).every((token) => known.some((text) => text.includes(token)));
}

export async function groundReply(input: GroundingInput): Promise<GroundedReply> {
  const problems: string[] = [];

  const producedThisTurn = new Set([
    ...input.facts.bookings.map((booking) => booking.reference),
    ...input.facts.payments.map((payment) => payment.reference),
  ]);
  const typedByGuest = new Set(extractReferences(input.guestMessage));

  for (const reference of extractReferences(input.reply)) {
    if (producedThisTurn.has(reference)) continue;

    const booking = await input.lookupReference(reference);
    if (!booking) {
      problems.push(`reference ${reference} does not exist`);
      continue;
    }

    // Quoting a real reference is fine for the guest who owns it, or who just
    // typed it themselves — never for surfacing somebody else's booking.
    const ownsIt =
      input.guestPhone !== null &&
      booking.guestPhone !== null &&
      booking.guestPhone === input.guestPhone;
    if (!ownsIt && !typedByGuest.has(reference)) {
      problems.push(`reference ${reference} belongs to another guest`);
    }
  }

  if (looksLikePaymentDetails(input.reply) && !paymentDetailsAreBacked(input.reply, input.facts)) {
    problems.push("payment details not backed by request-payment");
  }

  if (problems.length === 0) {
    return { blocked: false, reply: input.reply };
  }

  return { blocked: true, reason: problems.join("; "), reply: buildFactualReply(input.facts) };
}

/**
 * Rebuilds a reply from tool results alone. Used when the model's own text
 * cannot be trusted, so it says less — but everything it says is true.
 */
export function buildFactualReply(facts: ToolFacts): string {
  if (facts.bookings.length === 0 && facts.payments.length === 0) {
    return HANDOFF_REPLY;
  }

  const parts: string[] = [];

  for (const booking of facts.bookings) {
    parts.push(
      `Your booking at ${booking.property} (${booking.room}, ${booking.checkIn} to ${booking.checkOut}) is held under reference ${booking.reference}. The total is $${booking.totalAmountUsd}.`,
    );
  }

  for (const payment of facts.payments) {
    let line = `To pay for ${payment.reference} ($${payment.amountUsd}): ${payment.instructions}`;
    if (payment.paymentLink) line += `\nPay here: ${payment.paymentLink}`;
    parts.push(line);
  }

  parts.push("Your stay is held, not confirmed, until the lodge sees your payment.");
  return parts.join("\n\n");
}
