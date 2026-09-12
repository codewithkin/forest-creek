import { getPropertyIdsForStaff, isStaffRole } from "@forest-creek/db";
import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/**
 * Anyone who may see a dashboard. Resolves which properties they may act on:
 * "all" for an owner, an explicit list for a property manager.
 */
export const staffProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const { role, id } = ctx.session.user;
  if (!isStaffRole(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access required" });
  }

  const propertyIds = await getPropertyIdsForStaff(id, role);
  if (propertyIds !== "all" && propertyIds.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No properties are assigned to this account yet",
    });
  }

  return next({ ctx: { ...ctx, staff: { role, propertyIds } } });
});

export const adminProcedure = staffProcedure.use(({ ctx, next }) => {
  if (ctx.staff.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next({ ctx });
});

export type StaffScope = { role: string; propertyIds: string[] | "all" };

/**
 * Narrows a requested property to what the caller may see. Returns undefined
 * for an unrestricted owner asking for everything, which the db layer reads as
 * "no filter".
 */
export function scopeProperties(
  staff: StaffScope,
  requested?: string,
): string[] | undefined {
  if (staff.propertyIds === "all") {
    return requested ? [requested] : undefined;
  }
  if (!requested) return staff.propertyIds;
  if (!staff.propertyIds.includes(requested)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That property is not yours to view" });
  }
  return [requested];
}

/** Throws unless the caller may write to this specific property. */
export function assertPropertyAccess(staff: StaffScope, propertyId: string): void {
  if (staff.propertyIds === "all") return;
  if (!staff.propertyIds.includes(propertyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That property is not yours to edit" });
  }
}
