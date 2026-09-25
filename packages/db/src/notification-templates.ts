/**
 * What each booking email says, and who gets it. Import-free and given
 * everything it needs, so the wording is unit tested without a database or a
 * mail server — the same split as hold-policy.ts. Every policy figure comes
 * from booking-policy.ts, so an email can never quote a different rule from
 * the one the system applies.
 *
 * Plain text on purpose: it survives every mail client and every forwarding
 * rule a small lodge's inbox might have, and there is nothing here a guest
 * needs formatting to understand.
 */
import {
  BALANCE_DUE_DAYS,
  CREDIT_VALIDITY_MONTHS,
  DEPOSIT_PERCENT,
  REFUND_BUSINESS_DAYS,
  REFUND_PROCESSING_FEE_PERCENT,
  usd,
} from "./booking-policy";

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
  body: string;
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

function stayLines(booking: NotifiableBooking): string {
  const lines = [
    `Reference: ${booking.reference}`,
    `Stay: ${booking.roomName} at ${booking.propertyName}`,
    `Dates: ${stayDay(booking.checkIn)} to ${stayDay(booking.checkOut)} (${booking.nights} ${
      booking.nights === 1 ? "night" : "nights"
    })`,
    `Guests: ${booking.guests}`,
  ];
  if (booking.activityNames.length > 0) {
    lines.push(`Experiences: ${booking.activityNames.join(", ")}`);
  }
  lines.push(`Total: ${usd(booking.totalAmount)}`, `Payment: ${methodLabel(booking.paymentMethod)}`);
  if (booking.amountPaid > 0) {
    lines.push(`Paid so far: ${usd(booking.amountPaid)}`);
    if (balanceOf(booking) > 0) lines.push(`Balance: ${usd(balanceOf(booking))}`);
  }
  return lines.join("\n");
}

/** "The balance of $300 is due by Thu, 6 Aug 2026." — or nothing when none is due. */
function balanceLine(booking: NotifiableBooking): string[] {
  const balance = balanceOf(booking);
  if (balance <= 0) return [];
  return booking.balanceDueAt
    ? [`The balance of ${usd(balance)} is due by ${stayDay(booking.balanceDueAt)} (${BALANCE_DUE_DAYS} days before arrival).`]
    : [`The balance of ${usd(balance)} is still to be paid.`];
}

function signOff(booking: NotifiableBooking, context: NotificationContext): string {
  return [
    "",
    `Our Booking & Cancellation Policy: ${context.policyUrl}`,
    `Questions? Reply to this email or call ${context.contactPhone}.`,
    "",
    booking.propertyName,
  ].join("\n");
}

function guest(booking: NotifiableBooking, subject: string, body: string[]): RenderedNotification {
  return { audience: "guest", recipient: booking.guestEmail, subject, body: body.join("\n") };
}

function staff(context: NotificationContext, subject: string, body: string[]): RenderedNotification {
  return { audience: "staff", recipient: context.staffEmail, subject, body: body.join("\n") };
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
  const first = booking.guestName.split(/\s+/)[0] || booking.guestName;
  const staffStay = [stayLines(booking), `Guest: ${booking.guestName} <${booking.guestEmail}>`];
  const deposit = booking.depositAmount ?? booking.totalAmount;
  const fullUpFront = deposit >= booking.totalAmount;

  switch (event) {
    case "created": {
      const secure = fullUpFront
        ? `To secure your booking, please pay the full ${usd(booking.totalAmount)} now — you arrive within 14 days, so the whole stay is due at booking.`
        : `To secure your booking, please pay the ${DEPOSIT_PERCENT}% non-refundable deposit of ${usd(deposit)}.`;
      const hold = booking.holdExpiresAt
        ? [`We're holding the room for you until ${lodgeTime(booking.holdExpiresAt)}.`]
        : [];
      return [
        guest(booking, `Your booking ${booking.reference} — payment pending`, [
          `Hello ${first},`,
          "",
          `Thank you for booking with ${booking.propertyName}.`,
          "",
          stayLines(booking),
          "",
          secure,
          ...hold,
          "Your booking is confirmed once that payment is received.",
          ...(fullUpFront ? [] : ["", ...balanceLine({ ...booking, amountPaid: deposit })]),
          "",
          `Pay or check your payment here: ${context.payUrl}`,
          signOff(booking, context),
        ]),
        staff(context, `New booking ${booking.reference} — awaiting payment`, [
          `A new booking came in through ${booking.channel === "whatsapp" ? "WhatsApp" : "the website"}.`,
          "",
          ...staffStay,
          fullUpFront ? `Due now: ${usd(booking.totalAmount)} (full, arriving within 14 days)` : `Deposit due now: ${usd(deposit)}`,
          ...(booking.notes ? ["", `Guest notes: ${booking.notes}`] : []),
          "",
          booking.holdExpiresAt
            ? `The room is held until ${lodgeTime(booking.holdExpiresAt)} while the guest pays.`
            : "This booking has no hold time.",
        ]),
      ];
    }

    case "confirmed": {
      const partly = balanceOf(booking) > 0;
      return [
        guest(booking, `Booking confirmed — ${booking.reference}`, [
          `Hello ${first},`,
          "",
          partly
            ? `We've received your deposit of ${usd(booking.amountPaid)}, and your stay at ${booking.propertyName} is confirmed.`
            : `Your payment has been received and your stay at ${booking.propertyName} is confirmed.`,
          "",
          stayLines(booking),
          ...(partly ? ["", ...balanceLine(booking), `Pay it here: ${context.payUrl}`] : []),
          "",
          `Download your receipt: ${context.payUrl}`,
          "",
          "We look forward to welcoming you to the Vumba.",
          signOff(booking, context),
        ]),
        staff(context, `${partly ? "Deposit paid" : "Paid"}: ${booking.reference} — ${usd(booking.amountPaid)}`, [
          `${booking.reference} is confirmed${partly ? `, with ${usd(balanceOf(booking))} still due` : " and paid in full"}.`,
          "",
          ...staffStay,
          "",
          `Confirmed by: ${booking.verifiedBy ?? "unknown"}`,
          ...(booking.paynowReference ? [`Paynow reference: ${booking.paynowReference}`] : []),
        ]),
      ];
    }

    case "paid-in-full":
      return [
        guest(booking, `Paid in full — ${booking.reference}`, [
          `Hello ${first},`,
          "",
          `We've received your balance. Your stay at ${booking.propertyName} is paid in full.`,
          "",
          stayLines(booking),
          "",
          `Download your receipts: ${context.payUrl}`,
          signOff(booking, context),
        ]),
        staff(context, `Balance paid: ${booking.reference}`, [
          `${booking.reference} is now paid in full (${usd(booking.amountPaid)}).`,
          "",
          ...staffStay,
          ...(booking.paynowReference ? [`Paynow reference: ${booking.paynowReference}`] : []),
        ]),
      ];

    case "balance-reminder":
      return [
        guest(booking, `Balance due for ${booking.reference}`, [
          `Hello ${first},`,
          "",
          `A reminder about your stay at ${booking.propertyName}.`,
          "",
          ...balanceLine(booking),
          `Pay it here: ${context.payUrl}`,
          "",
          stayLines(booking),
          signOff(booking, context),
        ]),
      ];

    case "amended":
      return [
        guest(booking, `Your booking ${booking.reference} has new dates`, [
          `Hello ${first},`,
          "",
          `We've changed the dates of your stay at ${booking.propertyName}. Here is the booking as it now stands:`,
          "",
          stayLines(booking),
          ...(balanceOf(booking) > 0 ? ["", ...balanceLine(booking), `Pay it here: ${context.payUrl}`] : []),
          signOff(booking, context),
        ]),
        staff(context, `Dates changed: ${booking.reference}`, [
          `${booking.reference} was moved to new dates.`,
          "",
          ...staffStay,
          ...(booking.verifiedBy ? ["", `Changed by: ${booking.verifiedBy}`] : []),
        ]),
      ];

    case "cancelled": {
      const refund = (booking.refundAmountCents ?? 0) / 100;
      // A refund due with no amount worked out is from before the policy was
      // applied: staff decide it, so no figure is promised.
      const undecided = booking.refundStatus === "due" && booking.refundAmountCents === null;
      const refundDue = booking.refundStatus === "due" && refund > 0;
      const keptAll = booking.amountPaid > 0 && !refundDue && !undecided;
      const refundLines = undecided
        ? ["", "Our team will be in touch about your refund, and we'll email you once it has been sent."]
        : refundDue
        ? [
            "",
            `Under our cancellation policy, ${usd(refund)} will be refunded to your original payment method within ${REFUND_BUSINESS_DAYS} business days (after a ${REFUND_PROCESSING_FEE_PERCENT}% processing fee). We'll email you once it has been sent.`,
            `If you'd rather, we can instead offer a free postponement within ${CREDIT_VALIDITY_MONTHS} months or a ${CREDIT_VALIDITY_MONTHS}-month credit voucher — just reply to this email.`,
          ]
        : keptAll
          ? ["", `Under our cancellation policy, the ${usd(booking.amountPaid)} paid is not refundable.`]
          : [];
      return [
        guest(booking, `Your booking ${booking.reference} has been cancelled`, [
          `Hello ${first},`,
          "",
          `Your booking at ${booking.propertyName} has been cancelled and the dates released.`,
          "",
          stayLines(booking),
          ...refundLines,
          "",
          "If you did not expect this, please get in touch and we'll sort it out.",
          signOff(booking, context),
        ]),
        staff(context, `Cancelled: ${booking.reference}${refundDue ? ` — refund due ${usd(refund)}` : undecided ? " — refund due" : ""}`, [
          `${booking.reference} was cancelled and its dates are free again.`,
          ...(undecided
            ? ["", "It was paid, so a refund is due. Record the refund, a credit voucher, or why none is owed, on the dashboard."]
            : refundDue
            ? [
                "",
                `The policy refund is ${usd(refund)} (after the ${REFUND_PROCESSING_FEE_PERCENT}% fee). Record the refund, a credit voucher, or why none is owed, on the dashboard.`,
              ]
            : keptAll
              ? ["", `Under the policy nothing of the ${usd(booking.amountPaid)} paid is refunded.`]
              : []),
          "",
          ...staffStay,
          ...(booking.verifiedBy ? ["", `Cancelled by: ${booking.verifiedBy}`] : []),
          ...(booking.paynowReference ? [`Paynow reference: ${booking.paynowReference}`] : []),
        ]),
      ];
    }

    case "expired":
      return [
        guest(booking, `Your hold on ${booking.reference} has run out`, [
          `Hello ${first},`,
          "",
          "We held the room for you, but no payment arrived in time, so the dates have been released.",
          "",
          stayLines(booking),
          "",
          `You can still pay here — we'll check the room is free first: ${context.payUrl}`,
          signOff(booking, context),
        ]),
      ];

    case "refunded": {
      const refund = booking.refundAmountCents !== null ? booking.refundAmountCents / 100 : null;
      return [
        guest(booking, `Your refund for ${booking.reference} has been sent`, [
          `Hello ${first},`,
          "",
          refund !== null
            ? `We've refunded ${usd(refund)} for your cancelled booking ${booking.reference} at ${booking.propertyName}.`
            : `We've sent the refund for your cancelled booking ${booking.reference} at ${booking.propertyName}.`,
          ...(booking.refundNote ? ["", `Refund reference: ${booking.refundNote}`] : []),
          "",
          "Depending on your provider it can take a few days to appear.",
          signOff(booking, context),
        ]),
      ];
    }

    case "refund-declined":
      return [
        guest(booking, `About the refund for ${booking.reference}`, [
          `Hello ${first},`,
          "",
          `Under our cancellation policy, the payment for your cancelled booking ${booking.reference} at ${booking.propertyName} will not be refunded.`,
          ...(booking.refundNote ? ["", booking.refundNote] : []),
          "",
          "If you think this is a mistake, please reply and we'll look at it again.",
          signOff(booking, context),
        ]),
      ];

    case "credit":
      return [
        guest(booking, `Your credit for ${booking.reference}`, [
          `Hello ${first},`,
          "",
          `As agreed, instead of a refund for your cancelled booking ${booking.reference}, you have a credit with ${booking.propertyName}, valid for ${CREDIT_VALIDITY_MONTHS} months.`,
          ...(booking.refundNote ? ["", booking.refundNote] : []),
          "",
          "To use it, reply to this email with the dates you'd like.",
          signOff(booking, context),
        ]),
      ];

    case "review":
      return [
        staff(context, `Needs attention: ${booking.reference}`, [
          booking.reviewNote ?? `${booking.reference} needs a member of staff to look at it.`,
          "",
          ...staffStay,
          ...(booking.paynowReference ? [`Paynow reference: ${booking.paynowReference}`] : []),
        ]),
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
  if (pricePerPerson === null) return "Price: to be announced — we will confirm it with you";
  if (pricePerPerson === 0) return "Price: no charge";
  const people = guests === 1 ? "1 guest" : `${guests} guests`;
  return `Price: ${usd(pricePerPerson)} per person — ${usd(pricePerPerson * guests)} for ${people}`;
}

function visitLines(visit: NotifiableDayVisit): string {
  return [
    `Reference: ${visit.reference}`,
    `Day visit: ${visit.visitName} at ${visit.propertyName}`,
    `Date: ${stayDay(visit.visitDate)}`,
    `Guests: ${visit.guests}`,
    dayVisitPriceLine(visit.pricePerPerson, visit.guests),
  ].join("\n");
}

function visitSignOff(visit: NotifiableDayVisit, context: DayVisitNotificationContext): string {
  return ["", `Questions? Reply to this email or call ${context.contactPhone}.`, "", visit.propertyName].join("\n");
}

export function renderDayVisitNotifications(
  event: DayVisitEvent,
  visit: NotifiableDayVisit,
  context: DayVisitNotificationContext,
): RenderedNotification[] {
  const first = visit.guestName.split(/\s+/)[0] || visit.guestName;
  const toGuest = (subject: string, body: string[]): RenderedNotification => ({
    audience: "guest",
    recipient: visit.guestEmail,
    subject,
    body: body.join("\n"),
  });
  const noteFromUs = visit.staffNote ? ["", `A note from the team: ${visit.staffNote}`] : [];

  switch (event) {
    case "visit-requested":
      return [
        toGuest(`We've received your day visit request — ${visit.reference}`, [
          `Hello ${first},`,
          "",
          `Thank you for asking to spend the day at ${visit.propertyName}. This is a request, not yet a confirmed visit — our team will email you to confirm.`,
          "",
          visitLines(visit),
          "",
          "Nothing is paid online for a day visit. We will tell you how to pay when we confirm.",
          visitSignOff(visit, context),
        ]),
        {
          audience: "staff",
          recipient: context.staffEmail,
          subject: `Day visit request: ${visit.reference} — ${stayDay(visit.visitDate)}, ${visit.guests} ${visit.guests === 1 ? "guest" : "guests"}`,
          body: [
            `${visit.guestName} would like to come for the day.`,
            "",
            visitLines(visit),
            `Guest: ${visit.guestName} <${visit.guestEmail}>, ${visit.guestPhone}`,
            `Asked via: ${visit.channel === "whatsapp" ? "WhatsApp" : "the website"}`,
            ...(visit.note ? [`Note: ${visit.note}`] : []),
            "",
            "Confirm or decline it in the dashboard, under Day visits.",
          ].join("\n"),
        },
      ];

    case "visit-confirmed":
      return [
        toGuest(`Your day visit is confirmed — ${visit.reference}`, [
          `Hello ${first},`,
          "",
          `Good news: your day visit to ${visit.propertyName} is confirmed. We look forward to welcoming you.`,
          "",
          visitLines(visit),
          ...noteFromUs,
          visitSignOff(visit, context),
        ]),
      ];

    case "visit-declined":
      return [
        toGuest(`About your day visit request — ${visit.reference}`, [
          `Hello ${first},`,
          "",
          `We are sorry — we can't welcome you to ${visit.propertyName} on ${stayDay(visit.visitDate)}.`,
          ...noteFromUs,
          "",
          `You are welcome to ask for another day: ${context.dayVisitsUrl}`,
          visitSignOff(visit, context),
        ]),
      ];

    case "visit-cancelled":
      return [
        toGuest(`Your day visit has been cancelled — ${visit.reference}`, [
          `Hello ${first},`,
          "",
          `Your day visit to ${visit.propertyName} on ${stayDay(visit.visitDate)} has been cancelled.`,
          ...noteFromUs,
          "",
          `If that is a surprise, or you would like another day, call ${context.contactPhone} or visit ${context.dayVisitsUrl}.`,
          visitSignOff(visit, context),
        ]),
      ];
  }
}
