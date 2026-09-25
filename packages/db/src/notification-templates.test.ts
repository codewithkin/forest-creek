import { describe, expect, test } from "bun:test";

import {
  notificationEvents,
  renderBookingNotifications,
  type NotifiableBooking,
} from "./notification-templates";

const booking: NotifiableBooking = {
  reference: "FC-ABC234",
  guestName: "Tariro Moyo",
  guestEmail: "tariro@example.com",
  propertyName: "Forest Creek Lodge",
  roomName: "Executive Suite",
  checkIn: new Date("2046-04-10T00:00:00Z"),
  checkOut: new Date("2046-04-12T00:00:00Z"),
  nights: 2,
  guests: 2,
  activityNames: ["Braai"],
  totalAmount: 260,
  paymentMethod: "ecocash",
  channel: "whatsapp",
  // 09:30 UTC is 11:30 in Harare.
  holdExpiresAt: new Date("2046-03-01T09:30:00Z"),
  paynowReference: "1234567",
  verifiedBy: "Paynow",
  reviewNote: null,
  notes: "Late arrival",
  paymentStatus: "pending",
  amountPaid: 0,
  depositAmount: 130,
  balanceDueAt: new Date("2046-03-27T00:00:00Z"),
  refundStatus: null,
  refundNote: null,
  refundAmountCents: null,
};

const context = {
  staffEmail: "admin@forestcreek.co.zw",
  contactPhone: "+263 71 995 6882",
  payUrl: "https://forestcreek.co.zw/pay/FC-ABC234",
  policyUrl: "https://forestcreek.co.zw/policies",
};

const render = (event: (typeof notificationEvents)[number], overrides: Partial<NotifiableBooking> = {}) =>
  renderBookingNotifications(event, { ...booking, ...overrides }, context);

describe("renderBookingNotifications", () => {
  test("a new booking tells the guest it is not confirmed yet and where to pay", () => {
    const [toGuest, toStaff] = render("created");
    expect(toGuest!.recipient).toBe("tariro@example.com");
    expect(toGuest!.subject).toContain("payment pending");
    expect(toGuest!.body).toContain("confirmed once that payment is received");
    expect(toGuest!.body).toContain("non-refundable deposit of $130");
    expect(toGuest!.body).toContain("balance of $130 is due by Tue, 27 Mar 2046");
    expect(toGuest!.body).toContain(context.policyUrl);
    expect(toGuest!.body).toContain(context.payUrl);
    expect(toGuest!.body).toContain("Hello Tariro,");

    expect(toStaff!.recipient).toBe("admin@forestcreek.co.zw");
    expect(toStaff!.body).toContain("WhatsApp");
    expect(toStaff!.body).toContain("Late arrival");
  });

  test("the hold time is given in Zimbabwe time, not UTC", () => {
    const [toGuest] = render("created");
    expect(toGuest!.body).toContain("11:30");
    expect(toGuest!.body).toContain("Zimbabwe time");
  });

  test("stay dates never shift a day, whatever the server's time zone", () => {
    const [toGuest] = render("confirmed");
    expect(toGuest!.body).toContain("Tue, 10 Apr 2046 to Thu, 12 Apr 2046 (2 nights)");
  });

  test("a confirmation gives staff the Paynow reference to reconcile against", () => {
    const [, toStaff] = render("confirmed", { amountPaid: 260, paymentStatus: "verified" });
    expect(toStaff!.subject).toBe("Paid: FC-ABC234 — $260");
    expect(toStaff!.body).toContain("Paynow reference: 1234567");
  });

  test("every payment email points the guest to their receipt download", () => {
    for (const event of ["confirmed", "paid-in-full"] as const) {
      const [toGuest] = render(event, { amountPaid: 260, paymentStatus: "verified" });
      expect(toGuest!.body).toContain(`Download your receipt`);
      expect(toGuest!.body).toContain(context.payUrl);
    }
  });

  test("an expired hold goes to the guest only, with a way back to pay", () => {
    const messages = render("expired");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.audience).toBe("guest");
    expect(messages[0]!.body).toContain(context.payUrl);
  });

  test("a review case goes to staff only and carries the note", () => {
    const messages = render("review", { reviewNote: "Paid after FC-ZZZ222 took the dates." });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.audience).toBe("staff");
    expect(messages[0]!.body).toContain("FC-ZZZ222");
  });

  test("every event renders a subject and body for every message", () => {
    for (const event of notificationEvents) {
      for (const message of render(event)) {
        expect(message.subject.length).toBeGreaterThan(5);
        expect(message.body).toContain("FC-ABC234");
      }
    }
  });

  test("one night reads as singular", () => {
    const [toGuest] = render("confirmed", { nights: 1 });
    expect(toGuest!.body).toContain("(1 night)");
  });
});

describe("refund wording", () => {
  test("cancelling a paid booking tells the guest a refund is coming and staff that one is due", () => {
    const [toGuest, toStaff] = render("cancelled", {
      paymentStatus: "verified",
      amountPaid: 260,
      refundStatus: "due",
      refundAmountCents: 12_350,
    });
    expect(toGuest!.body).toContain("$123.50 will be refunded");
    expect(toGuest!.body).toContain("within 14 business days");
    expect(toGuest!.body).toContain("credit voucher");
    expect(toStaff!.subject).toContain("refund due $123.50");
    expect(toStaff!.body).toContain("Record the refund");
  });

  test("cancelling an unpaid booking says nothing about refunds", () => {
    const [toGuest, toStaff] = render("cancelled");
    expect(toGuest!.body).not.toContain("refund");
    expect(toStaff!.subject).not.toContain("refund");
  });

  test("a sent refund gives the guest its reference", () => {
    const [toGuest] = render("refunded", { refundNote: "EcoCash MP240923.1234", refundAmountCents: 12_350 });
    expect(toGuest!.body).toContain("MP240923.1234");
    expect(toGuest!.body).toContain("$123.50");
  });

  test("a declined refund gives the guest the reason", () => {
    const [toGuest] = render("refund-declined", { refundNote: "Cancelled within 48 hours of arrival." });
    expect(toGuest!.body).toContain("within 48 hours");
  });
});

describe("deposit and balance wording", () => {
  test("a stay booked within 14 days asks for the whole amount now", () => {
    const [toGuest] = render("created", { depositAmount: 260, balanceDueAt: null });
    expect(toGuest!.body).toContain("pay the full $260 now");
    expect(toGuest!.body).not.toContain("balance");
  });

  test("a confirmed deposit states what is still owed and when", () => {
    const [toGuest, toStaff] = render("confirmed", { amountPaid: 130, paymentStatus: "partial" });
    expect(toGuest!.body).toContain("received your deposit of $130");
    expect(toGuest!.body).toContain("balance of $130 is due by Tue, 27 Mar 2046");
    expect(toStaff!.subject).toBe("Deposit paid: FC-ABC234 — $130");
  });

  test("a stay paid in full at once is confirmed without a balance line", () => {
    const [toGuest] = render("confirmed", { amountPaid: 260, paymentStatus: "verified" });
    expect(toGuest!.body).not.toContain("balance");
  });

  test("the balance reminder links to the payment page", () => {
    const [toGuest] = render("balance-reminder", { amountPaid: 130 });
    expect(toGuest!.body).toContain(context.payUrl);
    expect(toGuest!.body).toContain("$130");
  });

  test("cancelling after only the deposit says it is not refundable", () => {
    const [toGuest] = render("cancelled", { amountPaid: 130, refundStatus: null, refundAmountCents: 0 });
    expect(toGuest!.body).toContain("the $130 paid is not refundable");
  });
});
