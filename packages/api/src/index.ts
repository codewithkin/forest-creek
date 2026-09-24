import { getPropertyIdsForStaff, isStaffRole } from "@forest-creek/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import type { Context } from "./context";
import { createRateLimiter, type RateLimitRule } from "./rate-limit";

/**
 * A validation failure reaches the dashboard as one readable sentence
 * ("Cover photo: Add a cover photo") instead of zod's raw JSON, which is what
 * a manager saw on the property form. The structured issues stay on
 * data.zodIssues for any client that wants them.
 */
function readableZodMessage(issues: ZodError["issues"]): string {
  return issues
    .slice(0, 3)
    .map((issue) => {
      const field = issue.path
        .filter((part) => typeof part === "string")
        .map((part) =>
          String(part)
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .toLowerCase(),
        )
        .join(" ");
      const label = field ? field.charAt(0).toUpperCase() + field.slice(1) : "";
      return label ? `${label}: ${issue.message}` : issue.message;
    })
    .join(" · ");
}

export const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    if (error.cause instanceof ZodError) {
      return {
        ...shape,
        message: readableZodMessage(error.cause.issues),
        data: { ...shape.data, zodIssues: error.cause.issues },
      };
    }
    return shape;
  },
});

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

/**
 * A public procedure that refuses a caller who has used it `limit` times in
 * the window. `keyOf` can add a second key - the booking reference - so a
 * limit holds even across many addresses (e.g. PIN prompts pushed at one
 * guest's phone from a botnet).
 */
export function rateLimitedProcedure(
  name: string,
  rule: RateLimitRule,
  keyOf?: (input: unknown) => string | undefined,
) {
  const limiter = createRateLimiter(rule);
  return publicProcedure.use(async ({ ctx, getRawInput, next }) => {
    const keys = [`${name}:ip:${ctx.clientIp ?? "unknown"}`];
    if (keyOf) {
      const extra = keyOf(await getRawInput());
      if (extra) keys.push(`${name}:key:${extra}`);
    }
    for (const key of keys) {
      const result = limiter.hit(key);
      if (!result.ok) {
        const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60_000));
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        });
      }
    }
    return next();
  });
}
