/**
 * What each booking email says, and who gets it. Import-free and given
 * everything it needs, so the wording is unit tested without a database or a
 * mail server — the same split as hold-policy.ts. Every policy figure comes
 * from booking-policy.ts, so an email can never quote a different rule from
 * the one the system applies.
 *
 * Each message is written once as an EmailDocument (packages/mail's layout):
 * the plain-text body stored in the outbox and the branded HTML sent with it
 * are both rendered from that one document, so every email — guest or staff,
 * stay or day visit — shares the same header, spacing and footer and the two
 * parts can never disagree.
 */
import {
  BALANCE_DUE_DAYS,
  CREDIT_VALIDITY_MONTHS,
  DEPOSIT_PERCENT,
  REFUND_BUSINESS_DAYS,
  REFUND_PROCESSING_FEE_PERCENT,
  usd,
} from "./booking-policy";
import {
  renderEmailText,
  type EmailBlock,
  type EmailDocument,
} from "@forest-creek/mail/layout";

export const notificationEvents = [
  "created",
  "confirmed",
  "paid-in-full",
  "balance-reminder",
  "amended",
  "cancelled",
  "expired",
  "review",
  "refunded",
  "refund-declined",
  "credit",
] as const;
export type NotificationEvent = (typeof notificationEvents)[number];

export type NotificationAudience = "guest" | "staff";

/** The slice of a booking the templates read. */
export type NotifiableBooking = {
  reference: string;
  guestName: string;
  guestEmail: string;
  propertyName: string;
  roomName: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  guests: number;
  activityNames: string[];
  totalAmount: number;
  paymentMethod: string;
  channel: string;
  holdExpiresAt: Date | null;
  paynowReference: string | null;
  verifiedBy: string | null;
  reviewNote: string | null;
  notes: string | null;
  paymentStatus: string;
  amountPaid: number;
  depositAmount: number | null;
  balanceDueAt: Date | null;
  refundStatus: string | null;
  refundNote: string | null;
  refundAmountCents: number | null;
};

export type NotificationContext = {
  /** The property's own reservations inbox — where its staff emails go. */
  staffEmail: string;
  /** Quoted to the guest as the number to call. */
  contactPhone: string;
  /** This booking's payment page (/pay/<reference>). */
  payUrl: string;
  /** The Booking & Cancellation Policy page. */
  policyUrl: string;
};

export type RenderedNotification = {
  audience: NotificationAudience;
  recipient: string;
  subject: string;
  /** The plain-text part, rendered from `document`. */
  body: string;
  /** What the HTML part is rendered from at send time, in the shared layout. */
  document: EmailDocument;
};

const METHOD_LABELS: Record<string, string> = {
  ecocash: "EcoCash",
  onemoney: "OneMoney",
  innbucks: "InnBucks",
  visa: "Visa / Mastercard",
};

const methodLabel = (method: string) => METHOD_LABELS[method] ?? method;

/** Stay dates are UTC midnights: formatted in UTC or they shift a day. */
function stayDay(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A moment (the hold's end), in the lodge's own time zone. */
function lodgeTime(date: Date): string {
  return (
    date.toLocaleString("en-GB", {
      timeZone: "Africa/Harare",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    }) + " (Zimbabwe time)"
  );
}

const balanceOf = (booking: NotifiableBooking) => Math.max(0, booking.totalAmount - booking.amountPaid);

// Small builders, so each template reads as the email it produces.
const text = (value: string): EmailBlock => ({ kind: "text", text: value });
const callout = (value: string): EmailBlock => ({ kind: "callout", text: value });
const button = (label: string, url: string, primary = true): EmailBlock => ({ kind: "button", label, url, primary });
const link = (label: string, url: string): EmailBlock => ({ kind: "link", label, url });
const details = (rows: Array<[string, string]>): EmailBlock => ({ kind: "details", rows });

/** The booking at a glance — the same rows in every email about it. */
function stayRows(booking: NotifiableBooking): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Reference", booking.reference],
    ["Stay", `${booking.roomName} at ${booking.propertyName}`],
    [
      "Dates",
      `${stayDay(booking.checkIn)} to ${stayDay(booking.checkOut)} (${booking.nights} ${
        booking.nights === 1 ? "night" : "nights"
      })`,
    ],
    ["Guests", String(booking.guests)],
  ];
  if (booking.activityNames.length > 0) rows.push(["Experiences", booking.activityNames.join(", ")]);
  rows.push(["Total", usd(booking.totalAmount)], ["Payment", methodLabel(booking.paymentMethod)]);
  if (booking.amountPaid > 0) {
    rows.push(["Paid so far", usd(booking.amountPaid)]);
    if (balanceOf(booking) > 0) rows.push(["Balance", usd(balanceOf(booking))]);
  }
  return rows;
}

/** "The balance of $300 is due by Thu, 6 Aug 2026." — or nothing when none is due. */
function balanceLine(booking: NotifiableBooking): string[] {
  const balance = balanceOf(booking);
  if (balance <= 0) return [];
  return booking.balanceDueAt
    ? [`The balance of ${usd(balance)} is due by ${stayDay(booking.balanceDueAt)} (${BALANCE_DUE_DAYS} days before arrival).`]
    : [`The balance of ${usd(balance)} is still to be paid.`];
}

type GuestEmail = {
  subject: string;
  eyebrow: string;
  title: string;
  preheader: string;
  blocks: EmailBlock[];
};

function guest(booking: NotifiableBooking, context: NotificationContext, email: GuestEmail): RenderedNotification {
  const first = booking.guestName.split(/\s+/)[0] || booking.guestName;
  const document: EmailDocument = {
    preheader: email.preheader,
    eyebrow: email.eyebrow,
    title: email.title,
    greeting: `Hello ${first},`,
    blocks: [...email.blocks, link("Our Booking & Cancellation Policy", context.policyUrl)],
    contactPhone: context.contactPhone,
    signature: booking.propertyName,
  };
  return { audience: "guest", recipient: booking.guestEmail, subject: email.subject, body: renderEmailText(document), document };
}

type StaffEmail = { subject: string; title: string; blocks: EmailBlock[] };

function staffEmail(recipient: string, email: StaffEmail): RenderedNotification {
  const document: EmailDocument = {
    preheader: email.subject,
    eyebrow: "For the team",
    title: email.title,
    blocks: email.blocks,
  };
  return { audience: "staff", recipient, subject: email.subject, body: renderEmailText(document), document };
}

/**
 * The messages one event produces. An empty list is a valid answer: nobody
 * needs to hear that an abandoned hold ran out except the guest, and staff
 * alone need the review case.
 */
export function renderBookingNotifications(
  event: NotificationEvent,
  booking: NotifiableBooking,
  context: NotificationContext,
): RenderedNotification[] {
  const staffDetails = details([...stayRows(booking), ["Guest", `${booking.guestName} <${booking.guestEmail}>`]]);
  const paynowRef: EmailBlock[] = booking.paynowReference ? [text(`Paynow reference: ${booking.paynowReference}`)] : [];
  const deposit = booking.depositAmount ?? booking.totalAmount;
  const fullUpFront = deposit >= booking.totalAmount;
  const toStaff = (email: StaffEmail) => staffEmail(context.staffEmail, email);

  switch (event) {
    case "created": {
      const secure = fullUpFront
        ? `To secure your booking, please pay the full ${usd(booking.totalAmount)} now — you arrive within 14 days, so the whole stay is due at booking.`
        : `To secure your booking, please pay the ${DEPOSIT_PERCENT}% non-refundable deposit of ${usd(deposit)}.`;
      const hold = booking.holdExpiresAt ? [` We're holding the room for you until ${lodgeTime(booking.holdExpiresAt)}.`] : [];
      const balance = fullUpFront ? [] : balanceLine({ ...booking, amountPaid: deposit });
      return [
        guest(booking, context, {
          subject: `Your booking ${booking.reference} — payment pending`,
          eyebrow: "Payment pending",
          title: "Your room is waiting for you",
          preheader: `Pay to secure ${booking.roomName} — reference ${booking.reference}.`,
          blocks: [
            text(`Thank you for booking with ${booking.propertyName}.`),
            details(stayRows(booking)),
            callout(secure + hold.join("")),
            text("Your booking is confirmed once that payment is received."),
            ...balance.map(text),
            button("Pay or check your payment here", context.payUrl),
          ],
        }),
        toStaff({
          subject: `New booking ${booking.reference} — awaiting payment`,
          title: "New booking — awaiting payment",
          blocks: [
            text(`A new booking came in through ${booking.channel === "whatsapp" ? "WhatsApp" : "the website"}.`),
            staffDetails,
            text(
              fullUpFront
                ? `Due now: ${usd(booking.totalAmount)} (full, arriving within 14 days)`
                : `Deposit due now: ${usd(deposit)}`,
            ),
            ...(booking.notes ? [callout(`Guest notes: ${booking.notes}`)] : []),
            text(
              booking.holdExpiresAt
                ? `The room is held until ${lodgeTime(booking.holdExpiresAt)} while the guest pays.`
                : "This booking has no hold time.",
            ),
          ],
        }),
      ];
    }

    case "confirmed": {
      const partly = balanceOf(booking) > 0;
      return [
        guest(booking, context, {
          subject: `Booking confirmed — ${booking.reference}`,
          eyebrow: "Booking confirmed",
          title: "We look forward to welcoming you",
          preheader: `Your stay at ${booking.propertyName} is confirmed — reference ${booking.reference}.`,
          blocks: [
            text(
              partly
                ? `We've received your deposit of ${usd(booking.amountPaid)}, and your stay at ${booking.propertyName} is confirmed.`
                : `Your payment has been received and your stay at ${booking.propertyName} is confirmed.`,
            ),
            details(stayRows(booking)),
            ...(partly ? [callout(balanceLine(booking).join(" ")), button("Pay the balance here", context.payUrl)] : []),
            button("Download your receipt", context.payUrl, !partly),
            text("We look forward to welcoming you to the Vumba."),
          ],
        }),
        toStaff({
          subject: `${partly ? "Deposit paid" : "Paid"}: ${booking.reference} — ${usd(booking.amountPaid)}`,
          title: partly ? "Deposit paid — stay confirmed" : "Paid in full — stay confirmed",
          blocks: [
            text(
              `${booking.reference} is confirmed${partly ? `, with ${usd(balanceOf(booking))} still due` : " and paid in full"}.`,
            ),
            staffDetails,
            text(`Confirmed by: ${booking.verifiedBy ?? "unknown"}`),
            ...paynowRef,
          ],
        }),
      ];
    }

    case "paid-in-full":
      return [
        guest(booking, context, {
          subject: `Paid in full — ${booking.reference}`,
          eyebrow: "Paid in full",
          title: "Your stay is fully paid",
          preheader: `We've received your balance for ${booking.reference}.`,
          blocks: [
            text(`We've received your balance. Your stay at ${booking.propertyName} is paid in full.`),
            details(stayRows(booking)),
            button("Download your receipts", context.payUrl),
          ],
        }),
        toStaff({
          subject: `Balance paid: ${booking.reference}`,
          title: "Balance paid",
          blocks: [
            text(`${booking.reference} is now paid in full (${usd(booking.amountPaid)}).`),
            staffDetails,
            ...paynowRef,
          ],
        }),
      ];

    case "balance-reminder":
      return [
        guest(booking, context, {
          subject: `Balance due for ${booking.reference}`,
          eyebrow: "Balance due",
          title: "A reminder about your balance",
          preheader: `${usd(balanceOf(booking))} is due for ${booking.reference}.`,
          blocks: [
            text(`A reminder about your stay at ${booking.propertyName}.`),
            ...balanceLine(booking).map(callout),
            button("Pay it here", context.payUrl),
            details(stayRows(booking)),
          ],
        }),
      ];

    case "amended":
      return [
        guest(booking, context, {
          subject: `Your booking ${booking.reference} has new dates`,
          eyebrow: "Booking updated",
          title: "Your stay has new dates",
          preheader: `The dates of ${booking.reference} have changed.`,
          blocks: [
            text(
              `We've changed the dates of your stay at ${booking.propertyName}. Here is the booking as it now stands:`,
            ),
            details(stayRows(booking)),
            ...(balanceOf(booking) > 0
              ? [callout(balanceLine(booking).join(" ")), button("Pay it here", context.payUrl)]
              : []),
          ],
        }),
        toStaff({
          subject: `Dates changed: ${booking.reference}`,
          title: "Booking moved to new dates",
          blocks: [
            text(`${booking.reference} was moved to new dates.`),
            staffDetails,
            ...(booking.verifiedBy ? [text(`Changed by: ${booking.verifiedBy}`)] : []),
          ],
        }),
      ];

    case "cancelled": {
      const refund = (booking.refundAmountCents ?? 0) / 100;
      // A refund due with no amount worked out is from before the policy was
      // applied: staff decide it, so no figure is promised.
      const undecided = booking.refundStatus === "due" && booking.refundAmountCents === null;
      const refundDue = booking.refundStatus === "due" && refund > 0;
      const keptAll = booking.amountPaid > 0 && !refundDue && !undecided;
      const refundBlocks: EmailBlock[] = undecided
        ? [callout("Our team will be in touch about your refund, and we'll email you once it has been sent.")]
        : refundDue
          ? [
              callout(
                `Under our cancellation policy, ${usd(refund)} will be refunded to your original payment method within ${REFUND_BUSINESS_DAYS} business days (after a ${REFUND_PROCESSING_FEE_PERCENT}% processing fee). We'll email you once it has been sent.`,
              ),
              text(
                `If you'd rather, we can instead offer a free postponement within ${CREDIT_VALIDITY_MONTHS} months or a ${CREDIT_VALIDITY_MONTHS}-month credit voucher — just reply to this email.`,
              ),
            ]
          : keptAll
            ? [callout(`Under our cancellation policy, the ${usd(booking.amountPaid)} paid is not refundable.`)]
            : [];
      return [
        guest(booking, context, {
          subject: `Your booking ${booking.reference} has been cancelled`,
          eyebrow: "Booking cancelled",
          title: "Your booking has been cancelled",
          preheader: `${booking.reference} has been cancelled and the dates released.`,
          blocks: [
            text(`Your booking at ${booking.propertyName} has been cancelled and the dates released.`),
            details(stayRows(booking)),
            ...refundBlocks,
            text("If you did not expect this, please get in touch and we'll sort it out."),
          ],
        }),
        toStaff({
          subject: `Cancelled: ${booking.reference}${refundDue ? ` — refund due ${usd(refund)}` : undecided ? " — refund due" : ""}`,
          title: "Booking cancelled",
          blocks: [
            text(`${booking.reference} was cancelled and its dates are free again.`),
            ...(undecided
              ? [
                  callout(
                    "It was paid, so a refund is due. Record the refund, a credit voucher, or why none is owed, on the dashboard.",
                  ),
                ]
              : refundDue
                ? [
                    callout(
                      `The policy refund is ${usd(refund)} (after the ${REFUND_PROCESSING_FEE_PERCENT}% fee). Record the refund, a credit voucher, or why none is owed, on the dashboard.`,
                    ),
                  ]
                : keptAll
                  ? [text(`Under the policy nothing of the ${usd(booking.amountPaid)} paid is refunded.`)]
                  : []),
            staffDetails,
            ...(booking.verifiedBy ? [text(`Cancelled by: ${booking.verifiedBy}`)] : []),
            ...paynowRef,
          ],
        }),
      ];
    }

    case "expired":
      return [
        guest(booking, context, {
          subject: `Your hold on ${booking.reference} has run out`,
          eyebrow: "Hold expired",
          title: "Your hold has run out",
          preheader: `No payment arrived in time for ${booking.reference}, so the dates were released.`,
          blocks: [
            text("We held the room for you, but no payment arrived in time, so the dates have been released."),
            details(stayRows(booking)),
            button("You can still pay here — we'll check the room is free first", context.payUrl),
          ],
        }),
      ];

    case "refunded": {
      const refund = booking.refundAmountCents !== null ? booking.refundAmountCents / 100 : null;
      return [
        guest(booking, context, {
          subject: `Your refund for ${booking.reference} has been sent`,
          eyebrow: "Refund sent",
          title: "Your refund is on its way",
          preheader: `The refund for ${booking.reference} has been sent.`,
          blocks: [
            text(
              refund !== null
                ? `We've refunded ${usd(refund)} for your cancelled booking ${booking.reference} at ${booking.propertyName}.`
                : `We've sent the refund for your cancelled booking ${booking.reference} at ${booking.propertyName}.`,
            ),
            ...(booking.refundNote ? [details([["Refund reference", booking.refundNote]])] : []),
            text("Depending on your provider it can take a few days to appear."),
          ],
        }),
      ];
    }

    case "refund-declined":
      return [
        guest(booking, context, {
          subject: `About the refund for ${booking.reference}`,
          eyebrow: "About your refund",
          title: "About your refund",
          preheader: `An update on the refund for ${booking.reference}.`,
          blocks: [
            text(
              `Under our cancellation policy, the payment for your cancelled booking ${booking.reference} at ${booking.propertyName} will not be refunded.`,
            ),
            ...(booking.refundNote ? [callout(booking.refundNote)] : []),
            text("If you think this is a mistake, please reply and we'll look at it again."),
          ],
        }),
      ];

    case "credit":
      return [
        guest(booking, context, {
          subject: `Your credit for ${booking.reference}`,
          eyebrow: "Credit voucher",
          title: "Your stay credit",
          preheader: `A ${CREDIT_VALIDITY_MONTHS}-month credit for ${booking.reference}.`,
          blocks: [
            text(
              `As agreed, instead of a refund for your cancelled booking ${booking.reference}, you have a credit with ${booking.propertyName}, valid for ${CREDIT_VALIDITY_MONTHS} months.`,
            ),
            ...(booking.refundNote ? [callout(booking.refundNote)] : []),
            text("To use it, reply to this email with the dates you'd like."),
          ],
        }),
      ];

    case "review":
      return [
        toStaff({
          subject: `Needs attention: ${booking.reference}`,
          title: "A booking needs attention",
          blocks: [
            callout(booking.reviewNote ?? `${booking.reference} needs a member of staff to look at it.`),
            staffDetails,
            ...paynowRef,
          ],
        }),
      ];
  }
}

// ---------------------------------------------------------------------------
// Day visits: a day out with no night's stay, asked for and then answered by staff
// ---------------------------------------------------------------------------

export const dayVisitEvents = ["visit-requested", "visit-confirmed", "visit-declined", "visit-cancelled"] as const;
export type DayVisitEvent = (typeof dayVisitEvents)[number];

/** The slice of a day visit booking the templates read. */
export type NotifiableDayVisit = {
  reference: string;
  visitName: string;
  propertyName: string;
  visitDate: Date;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  note: string | null;
  pricePerPerson: number | null;
  staffNote: string | null;
  channel: string;
};

export type DayVisitNotificationContext = {
  staffEmail: string;
  contactPhone: string;
  /** The public day visits page. */
  dayVisitsUrl: string;
};

/** "$15 per person — $45 for 3 guests", or that the price is still to come. */
export function dayVisitPriceLine(pricePerPerson: number | null, guests: number): string {
  return `Price: ${dayVisitPrice(pricePerPerson, guests)}`;
}

function dayVisitPrice(pricePerPerson: number | null, guests: number): string {
  if (pricePerPerson === null) return "to be announced — we will confirm it with you";
  if (pricePerPerson === 0) return "no charge";
  const people = guests === 1 ? "1 guest" : `${guests} guests`;
  return `${usd(pricePerPerson)} per person — ${usd(pricePerPerson * guests)} for ${people}`;
}

function visitRows(visit: NotifiableDayVisit): Array<[string, string]> {
  return [
    ["Reference", visit.reference],
    ["Day visit", `${visit.visitName} at ${visit.propertyName}`],
    ["Date", stayDay(visit.visitDate)],
    ["Guests", String(visit.guests)],
    ["Price", dayVisitPrice(visit.pricePerPerson, visit.guests)],
  ];
}

export function renderDayVisitNotifications(
  event: DayVisitEvent,
  visit: NotifiableDayVisit,
  context: DayVisitNotificationContext,
): RenderedNotification[] {
  const first = visit.guestName.split(/\s+/)[0] || visit.guestName;
  const toGuest = (email: GuestEmail): RenderedNotification => {
    const document: EmailDocument = {
      preheader: email.preheader,
      eyebrow: email.eyebrow,
      title: email.title,
      greeting: `Hello ${first},`,
      blocks: email.blocks,
      contactPhone: context.contactPhone,
      signature: visit.propertyName,
    };
    return { audience: "guest", recipient: visit.guestEmail, subject: email.subject, body: renderEmailText(document), document };
  };
  const noteFromUs: EmailBlock[] = visit.staffNote ? [callout(`A note from the team: ${visit.staffNote}`)] : [];

  switch (event) {
    case "visit-requested":
      return [
        toGuest({
          subject: `We've received your day visit request — ${visit.reference}`,
          eyebrow: "Request received",
          title: "Thank you for your day visit request",
          preheader: `We'll email you to confirm ${visit.visitName} on ${stayDay(visit.visitDate)}.`,
          blocks: [
            text(
              `Thank you for asking to spend the day at ${visit.propertyName}. This is a request, not yet a confirmed visit — our team will email you to confirm.`,
            ),
            details(visitRows(visit)),
            callout("Nothing is paid online for a day visit. We will tell you how to pay when we confirm."),
          ],
        }),
        staffEmail(context.staffEmail, {
          subject: `Day visit request: ${visit.reference} — ${stayDay(visit.visitDate)}, ${visit.guests} ${visit.guests === 1 ? "guest" : "guests"}`,
          title: "New day visit request",
          blocks: [
            text(`${visit.guestName} would like to come for the day.`),
            details([
              ...visitRows(visit),
              ["Guest", `${visit.guestName} <${visit.guestEmail}>, ${visit.guestPhone}`],
              ["Asked via", visit.channel === "whatsapp" ? "WhatsApp" : "the website"],
              ...(visit.note ? ([["Note", visit.note]] as Array<[string, string]>) : []),
            ]),
            text("Confirm or decline it in the dashboard, under Day visits."),
          ],
        }),
      ];

    case "visit-confirmed":
      return [
        toGuest({
          subject: `Your day visit is confirmed — ${visit.reference}`,
          eyebrow: "Day visit confirmed",
          title: "See you on the day",
          preheader: `${visit.visitName} on ${stayDay(visit.visitDate)} is confirmed.`,
          blocks: [
            text(
              `Good news: your day visit to ${visit.propertyName} is confirmed. We look forward to welcoming you.`,
            ),
            details(visitRows(visit)),
            ...noteFromUs,
          ],
        }),
      ];

    case "visit-declined":
      return [
        toGuest({
          subject: `About your day visit request — ${visit.reference}`,
          eyebrow: "About your request",
          title: "We can't host you that day",
          preheader: `An update on your day visit request ${visit.reference}.`,
          blocks: [
            text(`We are sorry — we can't welcome you to ${visit.propertyName} on ${stayDay(visit.visitDate)}.`),
            ...noteFromUs,
            button("You are welcome to ask for another day", context.dayVisitsUrl),
            text(`Reference: ${visit.reference}`),
          ],
        }),
      ];

    case "visit-cancelled":
      return [
        toGuest({
          subject: `Your day visit has been cancelled — ${visit.reference}`,
          eyebrow: "Day visit cancelled",
          title: "Your day visit has been cancelled",
          preheader: `${visit.reference} on ${stayDay(visit.visitDate)} has been cancelled.`,
          blocks: [
            text(`Your day visit to ${visit.propertyName} on ${stayDay(visit.visitDate)} has been cancelled.`),
            ...noteFromUs,
            text(`If that is a surprise, or you would like another day, call ${context.contactPhone} or visit ${context.dayVisitsUrl}.`),
            text(`Reference: ${visit.reference}`),
          ],
        }),
      ];
  }
}
