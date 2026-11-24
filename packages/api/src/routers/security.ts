import { passwordHashOf, passwordSchema } from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { verifyPassword } from "better-auth/crypto";
import { z } from "zod";

import { deleteUnlocks, router, staffProcedure } from "../index";
import { createRateLimiter } from "../rate-limit";

/** Wrong passwords a person may try before waiting: enough for typos, too few to guess. */
const guesses = createRateLimiter({ limit: 8, windowMs: 10 * 60_000 });

export const securityRouter = router({
  /**
   * Re-enters the signed-in person's own password before a delete. Right, and
   * this session may delete for the next few minutes (DELETE_UNLOCK_MINUTES).
   */
  confirmPassword: staffProcedure.input(z.object({ password: passwordSchema })).mutation(async ({ ctx, input }) => {
    const sessionId = (ctx.session.session as { id?: string } | undefined)?.id;
    if (!sessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again, then try once more." });
    const attempt = guesses.hit(ctx.session.user.id);
    if (!attempt.ok) {
      const minutes = Math.max(1, Math.ceil(attempt.retryAfterMs / 60_000));
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` });
    }
    const hash = await passwordHashOf(ctx.session.user.id);
    if (!hash || !(await verifyPassword({ hash, password: input.password }))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That isn't your password." });
    }
    return { unlockedUntil: deleteUnlocks.unlock(sessionId).toISOString() };
  }),
});
