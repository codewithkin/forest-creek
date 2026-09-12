import { z } from "zod";

export const roomTiers = ["executive", "family", "standard"] as const;
export const bookingStatuses = ["pending", "confirmed", "cancelled"] as const;
export const paymentStatuses = ["pending", "verified", "rejected"] as const;
export const paymentMethods = ["card", "paypal", "bank_transfer"] as const;
export const chatSenders = ["guest", "ai", "admin"] as const;
export const userRoles = ["admin", "guest"] as const;

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
