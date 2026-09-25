import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  createBooking,
  formatReceiptNumber,
  getReceiptView,
  listReceipts,
  prisma,
  receiptKind,
  recordManualPayment,
  recordPaynowPaid,
} from "./index";

const PREFIX = "receipt-test";
let roomId: string;

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { guestEmail: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  await cleanup();
});
afterAll(cleanup);

let n = 1;
const book = (checkIn: string, checkOut: string) =>
  createBooking({
    guestName: "Receipt Guest",
    guestEmail: `${PREFIX}-${n++}@example.com`,
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
    policyAccepted: true,
  });

const inFlight = (id: string, amount: number, tag: string) =>
  prisma.booking.update({
    where: { id },
    data: {
      paynowChargeAmount: amount,
      paynowPollUrl: `https://www.paynow.co.zw/Interface/CheckPayment/?guid=${tag}`,
      paynowReference: "PN-" + tag,
    },
  });

describe("receipt rules", () => {
  test("the kind follows what was paid before and after", () => {
    expect(receiptKind(0, 180, 360)).toBe("deposit");
    expect(receiptKind(0, 360, 360)).toBe("full");
    expect(receiptKind(180, 360, 360)).toBe("balance");
    expect(receiptKind(180, 300, 360)).toBe("part");
  });

  test("numbers read FCR-<year>-<six digits>", () => {
    expect(formatReceiptNumber(42, new Date("2026-09-25T10:00:00Z"))).toBe("FCR-2026-000042");
  });
});

describe("issuing receipts", () => {
  test("a Paynow deposit, reported twice, issues exactly one deposit receipt", async () => {
    const booking = await book("2057-03-10", "2057-03-12");
    const charge = await inFlight(booking.id, booking.depositAmount!, `r1-${booking.reference}`);
    await recordPaynowPaid(charge, "paid");
    await recordPaynowPaid(charge, "paid");

    const receipts = await listReceipts({ bookingId: booking.id });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ amount: booking.depositAmount, kindLabel: "Deposit (50%)", methodLabel: "EcoCash" });

    const view = await getReceiptView(receipts[0]!.id);
    expect(view).toMatchObject({
      amount: booking.depositAmount,
      paidToDate: booking.depositAmount,
      balanceAfter: booking.totalAmount - booking.depositAmount!,
      paynowReference: `PN-r1-${booking.reference}`,
      booking: { reference: booking.reference, guestName: "Receipt Guest", balanceDueDate: "2057-02-24" },
    });
    expect(view?.number).toMatch(/^FCR-\d{4}-\d{6}$/);
    // Like every link-reachable view: never the guest's email.
    expect(JSON.stringify(view)).not.toContain(booking.guestEmail);
  });

  test("the balance gets its own receipt, numbered after the deposit's", async () => {
    const booking = await book("2057-04-10", "2057-04-12");
    await recordPaynowPaid(await inFlight(booking.id, booking.depositAmount!, `r2a-${booking.reference}`), "paid");
    await recordPaynowPaid(
      await inFlight(booking.id, booking.totalAmount - booking.depositAmount!, `r2b-${booking.reference}`),
      "paid",
    );
    const receipts = await listReceipts({ reference: booking.reference });
    expect(receipts.map((receipt) => receipt.kindLabel)).toEqual(["Deposit (50%)", "Balance"]);
    expect(receipts[1]!.number > receipts[0]!.number).toBe(true);
    const balance = await getReceiptView(receipts[1]!.id);
    expect(balance).toMatchObject({ balanceAfter: 0, paidToDate: booking.totalAmount });
  });

  test("a bank transfer staff record gets a receipt with its method", async () => {
    const booking = await book("2057-05-10", "2057-05-12");
    await recordManualPayment(
      { id: booking.id, amount: booking.totalAmount, method: "bank_transfer", note: "CBZ 991" },
      "manager@example.com",
    );
    const [receipt] = await listReceipts({ bookingId: booking.id });
    expect(receipt).toMatchObject({ kindLabel: "Full payment", methodLabel: "Bank transfer" });
  });

  test("an unknown receipt id is simply not found", async () => {
    expect(await getReceiptView("no-such-receipt")).toBeNull();
  });
});
