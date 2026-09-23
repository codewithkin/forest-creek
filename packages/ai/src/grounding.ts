/**
 * The last line of defence between the model and a guest. A booking reference
 * the database cannot back, or a claim that a real charge succeeded, must
 * never be sent, however confident the model sounds — a guest is either
 * charged real money by Paynow or they are not, and the model does not get to
 * decide which by itself.
 *
 * Deliberately import-free, so evals and tests can use it without loading the
 * validated environment.
 */

// brand.ts is import-free too, so this module stays loadable without the env.
import { brand } from "./brand";

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
  /** Paynow's own wording for how to approve the charge on the guest's phone. */
  instructions: string;
};

export type PaymentCheck = {
  reference: string;
  paid: boolean;
};

/** What the tools actually did this turn — the only facts a reply may lean on. */
export type ToolFacts = {
  bookings: CreatedBooking[];
  payments: IssuedPaymentRequest[];
  paymentChecks: PaymentCheck[];
  /** request-payment calls that sent nothing, with the tool's own reason. */
  paymentFailures?: { error: string }[];
};

type ToolEntry = { toolName?: string; result?: unknown };
type RawToolResult = ToolEntry & { payload?: ToolEntry };

const CREATE_BOOKING = new Set(["createBooking", "create-booking"]);
const REQUEST_PAYMENT = new Set(["requestPayment", "request-payment"]);
const CHECK_PAYMENT = new Set(["checkPaymentStatus", "check-payment-status"]);

export function collectToolFacts(toolResults: unknown): ToolFacts {
  const facts: ToolFacts = { bookings: [], payments: [], paymentChecks: [] };
  if (!Array.isArray(toolResults)) return facts;

  for (const raw of toolResults as RawToolResult[]) {
    // Mastra wraps each result in a payload; accept the flat shape too.
    const entry: ToolEntry = raw?.payload ?? raw;
    const name = entry?.toolName;
    const result = entry?.result as Record<string, unknown> | undefined;
    // A charge that was never sent is a fact too: the guest must hear why.
    if (name && result && result.ok === false && REQUEST_PAYMENT.has(name) && typeof result.error === "string") {
      (facts.paymentFailures ??= []).push({ error: result.error });
      continue;
    }
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
      facts.payments.push({
        reference: reference.toUpperCase(),
        amountUsd: Number(result.amountUsd ?? 0),
        instructions: String(result.instructions ?? ""),
      });
    }

    if (CHECK_PAYMENT.has(name)) {
      facts.paymentChecks.push({ reference: reference.toUpperCase(), paid: result.paid === true });
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
  `Sorry — I couldn't complete that just now, so nothing new has been booked or charged. The team at Forest Creek will pick this up with you shortly, or you can reach them on ${brand.reservationsPhone}.`;

/**
 * Payment details in a reply are only acceptable when request-payment returned
 * real ones this turn, and every account-like number the model wrote appears
 * in what the lodge configured.
 */
function paymentDetailsAreBacked(reply: string, facts: ToolFacts, typedDigits: Set<string>): boolean {
  // Numbers the guest typed this turn (their own mobile money number, most
  // often) are theirs, not invented: repeating one back is not a leak.
  const untyped = digitTokens(reply).filter((token) => !typedDigits.has(token));
  if (untyped.length === 0 && !PAYMENT_KEYWORDS.test(reply)) return true;

  const configured = facts.payments.filter((payment) =>
    looksLikePaymentDetails(payment.instructions),
  );
  if (configured.length === 0) return false;

  const known = configured.map((payment) => payment.instructions.replace(/\s/g, ""));
  return untyped.every((token) => known.some((text) => text.includes(token)));
}

// Phrasing that asserts a charge went through. Best-effort, the same way the
// reference and bank-detail checks below are: it catches the confident,
// unhedged claims that matter, not every way of phrasing one.
// Phrasing that says a charge or prompt went to the guest's phone. Found in
// the evals: request-payment reported mobile money was not set up, and the
// agent told the guest "I've sent the Ecocash request… enter your PIN to
// approve" for a charge that never existed.
const CHARGE_SENT_CLAIM =
  /\b(?:i(?:'|’)?ve sent|i have sent|we(?:'|’)?ve sent|(?:request|prompt) (?:has been|was) sent|sent (?:you )?(?:an? |the )?(?:ecocash |onemoney |mobile money |payment )?(?:request|prompt)|enter your pin|approve (?:it|the (?:payment|prompt|request|charge)) on your phone)\b/i;

const PAYMENT_CONFIRMED_CLAIM =
  /\b(payment (?:received|confirmed|successful|has gone through)|you(?:'|’)?re (?:paid|all paid)|paid in full|we(?:'|’)?(?:ve| have) received your payment)\b/i;

export async function groundReply(input: GroundingInput): Promise<GroundedReply> {
  const problems: string[] = [];

  const producedThisTurn = new Set([
    ...input.facts.bookings.map((booking) => booking.reference),
    ...input.facts.payments.map((payment) => payment.reference),
    ...input.facts.paymentChecks.map((check) => check.reference),
  ]);
  const confirmedPaidThisTurn = new Set(
    input.facts.paymentChecks.filter((check) => check.paid).map((check) => check.reference),
  );
  const typedByGuest = new Set(extractReferences(input.guestMessage));

  for (const reference of extractReferences(input.reply)) {
    if (producedThisTurn.has(reference)) continue;
    // Repeating a code the guest typed is not inventing one, whether or not it
    // exists — it is exactly how the assistant says "FC-ABC123 isn't in our system".
    if (typedByGuest.has(reference)) continue;

    const booking = await input.lookupReference(reference);
    if (!booking) {
      problems.push(`reference ${reference} does not exist`);
      continue;
    }

    // Quoting a real reference unprompted is fine only for the guest who owns
    // it — never a way of surfacing somebody else's booking.
    const ownsIt =
      input.guestPhone !== null &&
      booking.guestPhone !== null &&
      booking.guestPhone === input.guestPhone;
    if (!ownsIt) {
      problems.push(`reference ${reference} belongs to another guest`);
    }
  }

  const typedDigits = new Set(digitTokens(input.guestMessage));
  if (
    looksLikePaymentDetails(input.reply) &&
    !paymentDetailsAreBacked(input.reply, input.facts, typedDigits)
  ) {
    problems.push("payment details not backed by request-payment");
  }

  // A charge in flight is only real if request-payment sent it this turn, or
  // check-payment-status just asked Paynow about it.
  if (
    CHARGE_SENT_CLAIM.test(input.reply) &&
    input.facts.payments.length === 0 &&
    input.facts.paymentChecks.length === 0
  ) {
    problems.push("claims a charge was sent that request-payment did not send");
  }

  if (PAYMENT_CONFIRMED_CLAIM.test(input.reply) && confirmedPaidThisTurn.size === 0) {
    problems.push("claims a payment succeeded without check-payment-status confirming it");
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
  const paidReferences = new Set(
    facts.paymentChecks.filter((check) => check.paid).map((check) => check.reference),
  );

  const failures = facts.paymentFailures ?? [];
  if (
    facts.bookings.length === 0 &&
    facts.payments.length === 0 &&
    paidReferences.size === 0 &&
    failures.length === 0
  ) {
    return HANDOFF_REPLY;
  }

  const parts: string[] = [];

  for (const booking of facts.bookings) {
    parts.push(
      `Your booking at ${booking.property} (${booking.room}, ${booking.checkIn} to ${booking.checkOut}) is held under reference ${booking.reference}. The total is $${booking.totalAmountUsd}.`,
    );
  }

  for (const payment of facts.payments) {
    parts.push(`To pay for ${payment.reference} ($${payment.amountUsd}): ${payment.instructions}`);
  }

  for (const reference of paidReferences) {
    parts.push(`Payment received for ${reference} — the stay is now confirmed.`);
  }

  // The tool's own words for why nothing was charged (e.g. mobile money not
  // set up yet), so the guest hears the truth rather than a generic apology.
  for (const failure of new Set(failures.map((item) => item.error))) {
    parts.push(`No payment request was sent: ${failure}`);
  }

  const unpaidRemains = [...facts.bookings, ...facts.payments].some(
    (fact) => !paidReferences.has(fact.reference),
  );
  if (unpaidRemains) {
    parts.push("Any stay not listed as paid above is held, not confirmed, until the lodge sees payment.");
  }

  return parts.join("\n\n");
}
