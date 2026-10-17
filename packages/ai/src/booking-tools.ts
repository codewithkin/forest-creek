import {
  BookingError,
  checkMobileMoneyPayment,
  choosePaymentMethod,
  createBooking,
  findGuestStays,
  getActivities,
  getBookingByReference,
  getPropertyBySlug,
  getRoomByTier,
  addPendingConfirmation,
  clearPendingConfirmations,
  listPendingConfirmations,
  HOLD_MINUTES,
  initiateMobileMoneyPayment,
  lodgeToday,
  paymentMethods,
  paymentPlan,
} from "@forest-creek/db";
import { randomUUID } from "node:crypto";

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { ConfirmationGate, type BookingDetails, type ConfirmationStore } from "./confirmation";
import { CHANNEL_KEY, GUEST_PHONE_KEY, ownBooking, readContext, TURN_KEY } from "./guest-context";
import { paymentPageUrl, policyPageUrl } from "./links";
import { toolset } from "./toolset";

export { buildGuestContext, CHANNEL_KEY, GUEST_PHONE_KEY, readContext, TURN_KEY } from "./guest-context";

/** Read-backs waiting for the guest's reply; see ConfirmationGate. */
// In Postgres, so a redeploy between the read-back and the guest's "yes" does
// not turn their confirmation into a second read-back.
const databaseStore: ConfirmationStore = {
  list: async (guest, now) =>
    (await listPendingConfirmations(guest, new Date(now))).map((row) => ({
      key: row.key,
      turnId: row.turnId,
      details: row.details as BookingDetails,
      expiresAt: row.expiresAt.getTime(),
    })),
  add: (guest, pending) =>
    addPendingConfirmation(guest, { ...pending, expiresAt: new Date(pending.expiresAt) }),
  clear: clearPendingConfirmations,
};
const confirmations = new ConfirmationGate({ store: databaseStore });

export const createBookingTool = createTool({
  id: "create-booking",
  description:
    "Reserve a room, in two calls. Once check-availability confirmed the room is free and you have every detail, call this: the first call books nothing and returns needsConfirmation with a readBack to send the guest. After the guest confirms in their next message, call it again with exactly the same details to make the real reservation, which is held unpaid until the lodge verifies payment.",
  inputSchema: z.object({
    propertySlug: z.string().min(1).describe("Property slug from list-properties"),
    roomTier: z.string().min(1).describe("Room tier from list-rooms, e.g. executive"),
    checkIn: z.iso.date().describe("Arrival date, YYYY-MM-DD"),
    checkOut: z.iso.date().describe("Departure date, YYYY-MM-DD"),
    guests: z.number().int().positive().max(20),
    guestName: z.string().min(1).describe("The guest's full name, as they gave it"),
    guestEmail: z.string().min(1).describe("The guest's email address, for the confirmation"),
    activitySlugs: z
      .array(z.string().min(1))
      .default([])
      .describe("Experience slugs from list-activities, or an empty list"),
    paymentMethod: z
      .enum(paymentMethods)
      .describe(
        "How the guest wants to pay. Over WhatsApp offer ecocash or onemoney — those are the only ones you can charge from this chat. innbucks and visa are paid on a payment page instead; if the guest wants one of those, book it with that method and send them the paymentPageUrl create-booking returns.",
      ),
    notes: z.string().max(2000).optional().describe("Anything the guest asked us to know"),
  }),
  execute: async (input, context) => {
    const property = await getPropertyBySlug(input.propertySlug.trim().toLowerCase());
    if (!property || !property.active) {
      return { ok: false as const, error: `No property called "${input.propertySlug}"` };
    }

    const room = await getRoomByTier(property.id, input.roomTier.trim().toLowerCase());
    if (!room || !room.active) {
      return { ok: false as const, error: `No room "${input.roomTier}" at ${property.name}` };
    }

    if (input.checkOut <= input.checkIn) {
      return { ok: false as const, error: "checkOut must be a later date than checkIn" };
    }
    if (input.guests > room.capacity) {
      return { ok: false as const, error: room.name + " sleeps " + room.capacity, code: "OVER_CAPACITY" };
    }

    // Slugs are what the model has; the database wants ids.
    let matchedActivities: { id: string; name: string; price: number }[] = [];
    if (input.activitySlugs.length > 0) {
      const activities = await getActivities(property.id);
      const wanted = new Set(input.activitySlugs.map((slug) => slug.trim().toLowerCase()));
      const matched = activities.filter((activity) => wanted.has(activity.slug));
      if (matched.length !== wanted.size) {
        const known = activities.map((activity) => activity.slug).join(", ");
        return {
          ok: false as const,
          error: `Unknown experience. Available at ${property.name}: ${known}`,
        };
      }
      matchedActivities = matched;
    }

    const guestPhone = readContext(context, GUEST_PHONE_KEY);
    // Asking for a stay the guest already holds (a repeated "yes", or the
    // model retrying after booking) returns that booking, before any read-back
    // — instead of a second read-back, a clash with their own hold, or a
    // second room. The live run once told a guest their own room was taken.
    if (guestPhone) {
      // Exactly the same nights only: overlapping but different dates are a
      // different stay, and are refused like anyone else's clash.
      const existing = (
        await findGuestStays({
          guestPhone,
          roomId: room.id,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
        })
      ).find(
        (stay) =>
          stay.checkIn.toISOString().slice(0, 10) === input.checkIn &&
          stay.checkOut.toISOString().slice(0, 10) === input.checkOut,
      );
      if (existing) {
        return {
          ok: true as const,
          alreadyBooked: true as const,
          reference: existing.reference,
          property: existing.propertyName,
          room: existing.roomName,
          checkIn: existing.checkIn.toISOString().slice(0, 10),
          checkOut: existing.checkOut.toISOString().slice(0, 10),
          totalAmountUsd: existing.totalAmount,
          amountPaidUsd: existing.amountPaid,
          paymentStatus: existing.paymentStatus,
          bookingStatus: existing.bookingStatus,
          howToReply:
            "This guest already has this booking — nothing new was booked. Carry on with it: if it is unpaid, ask which number to charge and call request-payment (or send paymentPageUrl for innbucks/visa).",
          paymentPageUrl: paymentPageUrl(existing.reference),
        };
      }
    }

    const gate = await confirmations.decide(
      guestPhone ?? "unknown-guest",
      input,
      readContext(context, TURN_KEY) ?? randomUUID(),
    );
    if (gate.decision === "confirm") {
      const nights = Math.round(
        (Date.parse(input.checkOut + "T00:00:00Z") - Date.parse(input.checkIn + "T00:00:00Z")) /
          86_400_000,
      );
      // Priced the way createBooking prices it, so the read-back total is the booked total.
      const totalAmountUsd =
        room.pricePerNight * nights +
        matchedActivities.reduce((sum, activity) => sum + activity.price, 0);
      // The same plan createBooking will fix, so what the guest agrees to is what is charged.
      const plan = paymentPlan(totalAmountUsd, input.checkIn, lodgeToday());
      return {
        ok: false as const,
        needsConfirmation: true as const,
        readBack: {
          property: property.name,
          room: room.name,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          nights,
          guests: input.guests,
          activities: matchedActivities.map((activity) => activity.name),
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          paymentMethod: input.paymentMethod,
          totalAmountUsd,
          dueNowUsd: plan.depositAmount,
          dueNowIs: plan.fullPaymentRequired ? "the full amount (arriving within 14 days)" : "the 50% non-refundable deposit",
          balanceUsd: plan.balanceAmount,
          balanceDueDate: plan.balanceDueDate,
          policyUrl: policyPageUrl,
        },
        ...(gate.earlier
          ? {
              differsFromEarlierReadBack: gate.earlier.changed,
              earlierReadBack: gate.earlier.details,
            }
          : {}),
        howToReply: gate.earlier
          ? `Nothing is booked: these details differ from what you read back to the guest before (${gate.earlier.changed.join("; ")}). ` +
            "If the guest did not ask for that change, call create-booking once more with exactly earlierReadBack — that books it. " +
            "If they did, read the new details back and ask them to confirm. Do not call create-booking with any other details this turn."
          : gate.askedThisTurn
            ? "You already read these exact details back this turn; nothing is booked. Do not call create-booking again now — send the read-back and wait for the guest's reply."
            : "Nothing is booked yet. Read these details back — including the total, what is due now and when any balance is due — and tell the guest that confirming means agreeing to the Booking & Cancellation Policy at policyUrl. Ask them to confirm. Only after they confirm in their next message, call create-booking again with exactly the same details.",
      };
    }

    try {
      const booking = await createBooking({
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestPhone,
        roomId: room.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        activityIds: matchedActivities.map((activity) => activity.id),
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        channel: readContext(context, CHANNEL_KEY) === "whatsapp" ? "whatsapp" : "web",
        // The guest confirmed a read-back that stated the policy and linked it.
        policyAccepted: true,
      });

      return {
        ok: true as const,
        reference: booking.reference,
        property: booking.propertyName,
        room: booking.roomName,
        checkIn: booking.checkIn.toISOString().slice(0, 10),
        checkOut: booking.checkOut.toISOString().slice(0, 10),
        nights: booking.nights,
        guests: booking.guests,
        activities: booking.activityNames,
        subtotalUsd: booking.subtotal,
        totalAmountUsd: booking.totalAmount,
        paymentMethod: booking.paymentMethod,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        dueNowUsd: booking.depositAmount ?? booking.totalAmount,
        balanceUsd: booking.totalAmount - (booking.depositAmount ?? booking.totalAmount),
        balanceDueDate: booking.balanceDueAt?.toISOString().slice(0, 10) ?? null,
        // The agent once opened with "Your booking is confirmed!" and then said it was only held.
        howToReply:
          `Give the guest their booking reference. Tell them their stay is held, not confirmed, for ${HOLD_MINUTES} minutes while they pay dueNowUsd — if it isn't paid by then the dates are released. For ecocash or onemoney, ask which number to charge and call request-payment. For innbucks or visa, send them the payment page link. Never call it confirmed until check-payment-status says paid.`,
        paymentPageUrl: paymentPageUrl(booking.reference),
      };
    } catch (error) {
      // Domain refusals are answers for the guest, not crashes.
      if (error instanceof BookingError) {
        return { ok: false as const, error: error.message, code: error.code };
      }
      throw error;
    }
  },
});

export const requestPaymentTool = createTool({
  id: "request-payment",
  description:
    "Sends a real EcoCash/OneMoney charge to the guest's own phone via Paynow for an existing booking — the deposit first, then the balance, or the whole stay with payInFull — and returns Paynow's own instructions for approving it. Call this once you have the booking reference and the guest has told you which number to charge — never a number they haven't given you for this purpose. Pass network when the guest names EcoCash or OneMoney, so the charge goes to the right network even if they booked with the other one. This actually asks the guest's phone to pay; call check-payment-status afterwards to find out whether they did.",
  inputSchema: z.object({
    reference: z.string().min(1).describe("The booking reference (it starts with FC-)"),
    mobileMoneyNumber: z
      .string()
      .min(1)
      .describe("The EcoCash or OneMoney number to charge, exactly as the guest gave it"),
    network: z
      .enum(["ecocash", "onemoney"])
      .optional()
      .describe("The mobile money network that number is on, when the guest has said"),
    payInFull: z
      .boolean()
      .optional()
      .describe("Only if the guest asked to pay the whole stay now instead of the 50% deposit"),
  }),
  execute: async ({ reference, mobileMoneyNumber, network, payInFull }, context) => {
    try {
      // A guest who booked with EcoCash and now wants to pay from OneMoney (or
      // booked for card and would rather use mobile money) is switched first —
      // the charge always goes to the booking's method.
      if (network) {
        const booking = await getBookingByReference(reference);
        if (booking && booking.paymentMethod !== network) {
          const own = await ownBooking(reference, context);
          if ("error" in own) return { ok: false as const, ...own };
          await choosePaymentMethod(booking.reference, network);
        }
      }
      const result = await initiateMobileMoneyPayment(reference, mobileMoneyNumber, { payInFull });
      if (!result.ok) {
        // The real page to offer instead — the model once made one up.
        return {
          ok: false as const,
          error: result.error,
          paymentPageUrl: paymentPageUrl(reference),
          howToReply:
            "Tell the guest why, in plain words. If the booking is set to card or InnBucks, ask whether they'd rather pay by EcoCash or OneMoney (then call again with network) or send paymentPageUrl.",
        };
      }
      return result;
    } catch (error) {
      if (error instanceof BookingError) {
        return { ok: false as const, error: error.message, code: error.code };
      }
      throw error;
    }
  },
});

export const checkPaymentStatusTool = createTool({
  id: "check-payment-status",
  description:
    "Checks whether a charge request-payment sent is now paid. Call this when the guest says they've approved it, or a little after sending the charge. Only a paid: true result here means real money has moved — nothing else does.",
  inputSchema: z.object({
    reference: z.string().min(1).describe("The booking reference (it starts with FC-)"),
  }),
  execute: async ({ reference }) => {
    try {
      const result = await checkMobileMoneyPayment(reference);
      if (!result.ok) return { ok: false as const, error: result.error };
      return {
        ok: true as const,
        reference,
        paid: result.paid,
        bookingStatus: result.bookingStatus,
        paymentStatus: result.paymentStatus,
        amountPaidUsd: result.amountPaid,
        balanceDueUsd: result.balanceDue,
        // The page lists a downloadable PDF receipt for every payment.
        ...(result.paid ? { receiptsUrl: paymentPageUrl(reference) } : {}),
      };
    } catch (error) {
      if (error instanceof BookingError) {
        return { ok: false as const, error: error.message, code: error.code };
      }
      throw error;
    }
  },
});

/** Write tools, granted only to the WhatsApp booking agent. */
export const bookingTools = toolset([createBookingTool, requestPaymentTool, checkPaymentStatusTool]);
