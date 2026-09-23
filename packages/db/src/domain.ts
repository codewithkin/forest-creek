import { z } from "zod";

export const roomTiers = ["executive", "family", "standard"] as const;
export const bookingStatuses = ["pending", "confirmed", "cancelled"] as const;
// "processing" sits between pending and verified: a Paynow charge has been
// sent to the guest's phone and is awaiting their PIN. Only Paynow reporting
// the transaction paid moves a booking to "verified" — see
// packages/db/src/payments.ts.
export const paymentStatuses = ["pending", "processing", "verified", "rejected"] as const;
// Everything Forest Creek accepts, all of it through Paynow — see
// packages/payments. Ecocash and OneMoney are charged by a prompt on the
// guest's phone; InnBucks and Visa (which also covers Mastercard, and is what
// guests outside Zimbabwe use) are paid on Paynow's hosted page. PayPal and
// manual bank transfer are gone; older bookings keep whatever they were made
// with, since the column is a plain string.
export const paymentMethods = ["ecocash", "onemoney", "innbucks", "visa"] as const;
export const chatSenders = ["guest", "ai", "admin"] as const;
export const userRoles = ["admin", "manager", "guest"] as const;

/** Roles that may reach the dashboard at all. */
export const staffRoles = ["admin", "manager"] as const;

export const roomTierSchema = z.enum(roomTiers);
export const bookingStatusSchema = z.enum(bookingStatuses);
export const paymentStatusSchema = z.enum(paymentStatuses);
export const paymentMethodSchema = z.enum(paymentMethods);
export const chatSenderSchema = z.enum(chatSenders);
export const userRoleSchema = z.enum(userRoles);

export type RoomTier = z.infer<typeof roomTierSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type ChatSender = z.infer<typeof chatSenderSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type StaffRole = (typeof staffRoles)[number];

export function isStaffRole(role: string): role is StaffRole {
  return (staffRoles as readonly string[]).includes(role);
}
