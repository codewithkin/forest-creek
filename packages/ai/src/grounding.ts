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
  /** Paid and nothing left owing. Undefined when the caller does not know. */
  fullyPaid?: boolean;
};

/** Money already recorded on a booking, as a look-up tool read it this turn. */
export type RecordedPayment = {
  reference: string;
  amountPaidUsd: number;
  fullyPaid: boolean;
};

/** What the tools actually did this turn — the only facts a reply may lean on. */
export type ToolFacts = {
  bookings: CreatedBooking[];
  payments: IssuedPaymentRequest[];
  paymentChecks: PaymentCheck[];
  /** request-payment calls that sent nothing, with the tool's own reason. */
  paymentFailures?: { error: string }[];
  /**
   * What look-up-booking, get-payment-details and list-my-bookings read. Only
   * Paynow or staff recording money ever sets it, so it is as real as a
   * check-payment-status "paid" — "yes, we have your deposit" is true.
   */
  recordedPayments?: RecordedPayment[];
};

type ToolEntry = { toolName?: string; result?: unknown };
type RawToolResult = ToolEntry & { payload?: ToolEntry };

const CREATE_BOOKING = new Set(["createBooking", "create-booking"]);
const REQUEST_PAYMENT = new Set(["requestPayment", "request-payment"]);
const CHECK_PAYMENT = new Set(["checkPaymentStatus", "check-payment-status"]);
/** Tools that read the money already recorded on a booking. */
const READS_PAYMENTS = new Set(["look-up-booking", "lookUpBooking", "get-payment-details"]);
const LISTS_BOOKINGS = new Set(["list-my-bookings"]);

function recorded(entry: Record<string, unknown>): RecordedPayment | undefined {
  if (typeof entry.reference !== "string") return undefined;
  const amountPaidUsd = Number(entry.amountPaidUsd ?? 0);
  return {
    reference: entry.reference.toUpperCase(),
    amountPaidUsd,
    fullyPaid:
      entry.fullyPaid === true ||
      entry.paymentStatus === "verified" ||
      (amountPaidUsd > 0 && Number(entry.balanceDueUsd ?? NaN) === 0),
  };
}

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
    if (name && result && READS_PAYMENTS.has(name) && result.found === true) {
      const payment = recorded(result);
      if (payment) (facts.recordedPayments ??= []).push(payment);
      continue;
    }
    if (name && result && LISTS_BOOKINGS.has(name) && Array.isArray(result.bookings)) {
      for (const booking of result.bookings as Record<string, unknown>[]) {
        const payment = recorded(booking);
        if (payment) (facts.recordedPayments ??= []).push(payment);
      }
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
      const paid = result.paid === true;
      facts.paymentChecks.push({
        reference: reference.toUpperCase(),
        paid,
        fullyPaid: paid && Number(result.balanceDueUsd ?? NaN) === 0,
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
  /**
   * The website's origin (e.g. https://forestcreek.co.zw). When given, every
   * link in the reply must be one of our own guest pages. Passed in rather
   * than read from the environment, so this module stays import-free.
   */
  siteOrigin?: string;
  /**
   * Every real nightly room rate (USD). When given, a rate the reply quotes
   * "per night" must be one of them. Passed in so this module stays
   * import-free.
   */
  nightlyRates?: number[];
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
// agent told the guest "I've sent the EcoCash request… enter your PIN to
// approve" for a charge that never existed.
const CHARGE_SENT_CLAIM =
  /\b(?:i(?:'|’)?ve sent|i have sent|we(?:'|’)?ve sent|(?:request|prompt) (?:has been|was) sent|sent (?:you )?(?:an? |the )?(?:ecocash |onemoney |mobile money |payment )?(?:request|prompt)|enter your pin|approve (?:it|the (?:payment|prompt|request|charge)) on your phone)\b/i;

const LINK = /https?:\/\/[^\s<>"')\]]+/gi;
// The only pages an assistant may send a guest to: booking, the policy, day
// visits, and a booking's own payment page. No query strings — the model once sent
// "/pay?booking=FC-…&payment_method=ecocash", a page that does not exist.
const OWN_PAGE = /^\/(?:book|policies|day-visits|pay\/FC-[A-Z0-9]{6})\/?$/i;

/** Links in a reply that are not one of our own guest pages. */
export function inventedLinks(reply: string, siteOrigin: string): string[] {
  const origin = siteOrigin.replace(/\/$/, "").toLowerCase();
  return (reply.match(LINK) ?? [])
    // Trailing punctuation and WhatsApp formatting (*bold*, _italic_) are not part of the link.
    .map((link) => link.replace(/[.,;:!?*_~`]+$/, ""))
    .filter((link) => {
      let url: URL;
      try {
        url = new URL(link);
      } catch {
        return true;
      }
      return url.origin.toLowerCase() !== origin || url.search !== "" || !OWN_PAGE.test(url.pathname);
    });
}

// "$130 per night", "USD 180/night", "180 USD a night", "$90 nightly". Only
// nightly rates are checked: a total legitimately depends on nights and
// experiences, but a room's rate is a fixed fact. Found by the evals: asked
// for "50% off", the model answered "an Executive Suite at $130 per night".
const NIGHTLY_RATE =
  /(?:\$\s?|US\$\s?|USD\s?)(\d[\d,]*(?:\.\d{1,2})?)\s*(?:per night|\/\s?night|a night|each night|nightly|per room per night)|(\d[\d,]*(?:\.\d{1,2})?)\s?USD\s*(?:per night|\/\s?night|a night|nightly)/gi;

/** Nightly rates the reply quotes that no room actually has. */
export function inventedRates(reply: string, nightlyRates: number[]): number[] {
  const known = new Set(nightlyRates.map((rate) => Math.round(rate * 100)));
  const invented: number[] = [];
  for (const match of reply.matchAll(NIGHTLY_RATE)) {
    const amount = Number((match[1] ?? match[2] ?? "").replace(/,/g, ""));
    if (Number.isFinite(amount) && !known.has(Math.round(amount * 100))) invented.push(amount);
  }
  return [...new Set(invented)];
}

const PAYMENT_CONFIRMED_CLAIM =
  /\b(payment (?:received|confirmed|successful|has gone through)|you(?:'|’)?re (?:paid|all paid)|paid in full|we(?:'|’)?(?:ve| have) received your payment)\b/i;

/** Saying the WHOLE stay is paid — a deposit alone does not back this. */
const FULLY_PAID_CLAIM =
  /\b(?:(?:is|are|now|been) (?:fully paid|paid in full)|you(?:'|’)?re (?:all )?paid (?:up|in full)|fully paid up|nothing (?:left|more|else) to pay)\b/gi;

/** "Once the balance is in, you're paid in full" describes the future; it claims nothing. */
const CONDITIONAL = /\b(?:once|when|after|until|will|would|if)\b/i;

export function claimsFullyPaid(reply: string): boolean {
  for (const match of reply.matchAll(FULLY_PAID_CLAIM)) {
    const before = reply.slice(0, match.index);
    const sentenceStart = Math.max(...[".", "!", "?", "\n"].map((mark) => before.lastIndexOf(mark))) + 1;
    if (!CONDITIONAL.test(before.slice(sentenceStart))) return true;
  }
  return false;
}

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

  if (input.nightlyRates && input.nightlyRates.length > 0) {
    const invented = inventedRates(input.reply, input.nightlyRates);
    if (invented.length > 0) {
      problems.push(`quotes nightly rates no room has: ${invented.map((rate) => "$" + rate).join(", ")}`);
    }
  }

  if (input.siteOrigin) {
    const invented = inventedLinks(input.reply, input.siteOrigin);
    if (invented.length > 0) problems.push(`links to pages that do not exist: ${invented.join(", ")}`);
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

  const recordedPayments = input.facts.recordedPayments ?? [];
  if (
    PAYMENT_CONFIRMED_CLAIM.test(input.reply) &&
    confirmedPaidThisTurn.size === 0 &&
    !recordedPayments.some((payment) => payment.amountPaidUsd > 0)
  ) {
    problems.push("claims a payment succeeded without check-payment-status confirming it");
  }

  const fullyPaidFact =
    recordedPayments.some((payment) => payment.fullyPaid) ||
    input.facts.paymentChecks.some((check) => check.paid && check.fullyPaid !== false);
  if (claimsFullyPaid(input.reply) && !fullyPaidFact) {
    problems.push("claims the stay is paid in full when no tool showed a zero balance");
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
