/**
 * What each booking email says, and who gets it. Import-free and given
 * everything it needs, so the wording is unit tested without a database or a
 * mail server — the same split as hold-policy.ts.
 *
 * Plain text on purpose: it survives every mail client and every forwarding
 * rule a small lodge's inbox might have, and there is nothing here a guest
 * needs formatting to understand.
 */

export const notificationEvents = ["created", "confirmed", "cancelled", "expired", "review"] as const;
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
};

export type NotificationContext = {
  /** The property's own reservations inbox — where its staff emails go. */
  staffEmail: string;
  /** Quoted to the guest as the number to call. */
  contactPhone: string;
  /** This booking's payment page (/pay/<reference>). */
  payUrl: string;
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
  lines.push(`Total: $${booking.totalAmount}`, `Payment: ${methodLabel(booking.paymentMethod)}`);
  return lines.join("\n");
}

function signOff(booking: NotifiableBooking, context: NotificationContext): string {
  return [
    "",
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

  switch (event) {
    case "created": {
      const hold = booking.holdExpiresAt
        ? [
            `We're holding the room for you until ${lodgeTime(booking.holdExpiresAt)}.`,
            "Your booking is confirmed once payment is received.",
          ]
        : ["Your booking is confirmed once payment is received."];
      return [
        guest(booking, `Your booking ${booking.reference} — payment pending`, [
          `Hello ${first},`,
          "",
          `Thank you for booking with ${booking.propertyName}.`,
          "",
          stayLines(booking),
          "",
          ...hold,
          "",
          `Pay or check your payment here: ${context.payUrl}`,
          signOff(booking, context),
        ]),
        staff(context, `New booking ${booking.reference} — awaiting payment`, [
          `A new booking came in through ${booking.channel === "whatsapp" ? "WhatsApp" : "the website"}.`,
          "",
          ...staffStay,
          ...(booking.notes ? ["", `Guest notes: ${booking.notes}`] : []),
          "",
          booking.holdExpiresAt
            ? `The room is held until ${lodgeTime(booking.holdExpiresAt)} while the guest pays.`
            : "This booking has no hold time.",
        ]),
      ];
    }

    case "confirmed":
      return [
        guest(booking, `Booking confirmed — ${booking.reference}`, [
          `Hello ${first},`,
          "",
          `Your payment has been received and your stay at ${booking.propertyName} is confirmed.`,
          "",
          stayLines(booking),
          "",
          "We look forward to welcoming you to the Vumba.",
          signOff(booking, context),
        ]),
        staff(context, `Paid: ${booking.reference} — $${booking.totalAmount}`, [
          `${booking.reference} is paid and confirmed.`,
          "",
          ...staffStay,
          "",
          `Confirmed by: ${booking.verifiedBy ?? "unknown"}`,
          ...(booking.paynowReference ? [`Paynow reference: ${booking.paynowReference}`] : []),
        ]),
      ];

    case "cancelled":
      return [
        guest(booking, `Your booking ${booking.reference} has been cancelled`, [
          `Hello ${first},`,
          "",
          `Your booking at ${booking.propertyName} has been cancelled and the dates released.`,
          "",
          stayLines(booking),
          "",
          "If you did not expect this, please get in touch and we'll sort it out.",
          signOff(booking, context),
        ]),
        staff(context, `Cancelled: ${booking.reference}`, [
          `${booking.reference} was cancelled and its dates are free again.`,
          "",
          ...staffStay,
          ...(booking.verifiedBy ? ["", `Cancelled by: ${booking.verifiedBy}`] : []),
        ]),
      ];

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
