export type BookableRoom = {
  id: string;
  propertyId: string;
  tier: string;
  name: string;
  description: string;
  pricePerNight: number;
  capacity: number;
  bedType: string;
  image: string;
};

export type BookableActivity = {
  id: string;
  propertyId: string;
  slug: string;
  name: string;
  description: string;
  price: number;
};

/*
 * Everything is settled through Paynow, but on two different rails, and the
 * form behaves differently for each — see packages/payments/src/gateway.ts.
 *
 * "mobile" pushes a PIN prompt to a handset, so it needs a number to charge.
 * "web" sends the guest to Paynow's own page, where they choose how to pay
 * (card, OneMoney, InnBucks...), so it needs nothing extra from them here.
 */
export const paymentMethods = [
  { value: "ecocash", label: "EcoCash", rail: "mobile", hint: "Prompt sent to your phone" },
  { value: "paynow", label: "Other", rail: "web", hint: "Card, OneMoney, InnBucks and more — on Paynow's secure page" },
] as const;

export type PaymentMethodValue = (typeof paymentMethods)[number]["value"];
export type PaymentRail = (typeof paymentMethods)[number]["rail"];

export function railFor(method: PaymentMethodValue): PaymentRail {
  return paymentMethods.find((candidate) => candidate.value === method)!.rail;
}

const MS_PER_NIGHT = 86_400_000;

export function countNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const span = Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`);
  return span > 0 ? Math.round(span / MS_PER_NIGHT) : 0;
}

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}
