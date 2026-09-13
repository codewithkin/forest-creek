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

// Mobile money only, via Paynow — see packages/payments.
export const paymentMethods = [
  { value: "ecocash", label: "Ecocash" },
  { value: "onemoney", label: "OneMoney" },
] as const;

export type PaymentMethodValue = (typeof paymentMethods)[number]["value"];

const MS_PER_NIGHT = 86_400_000;

export function countNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const span = Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`);
  return span > 0 ? Math.round(span / MS_PER_NIGHT) : 0;
}

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}
