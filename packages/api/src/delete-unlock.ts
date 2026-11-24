/**
 * "Enter your password to delete", asked by the client on 2 Nov 2026. A
 * signed-in session that re-enters its password may delete for the next few
 * minutes, so ticking twenty rows and deleting them asks once, not twenty
 * times. Import-free, unit tested with a fake clock.
 *
 * In memory, like the rate limits: the API is one process, and a restart only
 * means the password is asked again.
 */
export const DELETE_UNLOCK_MINUTES = 5;

export type DeleteUnlocks = {
  unlock(sessionId: string, now?: number): Date;
  isUnlocked(sessionId: string | undefined, now?: number): boolean;
  size(): number;
};

export function createDeleteUnlocks(windowMs = DELETE_UNLOCK_MINUTES * 60_000): DeleteUnlocks {
  const until = new Map<string, number>();

  function sweep(now: number) {
    for (const [key, expires] of until) if (expires <= now) until.delete(key);
  }

  return {
    unlock(sessionId, now = Date.now()) {
      sweep(now);
      const expires = now + windowMs;
      until.set(sessionId, expires);
      return new Date(expires);
    },
    isUnlocked(sessionId, now = Date.now()) {
      if (!sessionId) return false;
      const expires = until.get(sessionId);
      return expires !== undefined && expires > now;
    },
    size: () => until.size,
  };
}

/** The message a delete without a fresh password fails with; the dashboard asks for the password and tries again. */
export const PASSWORD_REQUIRED_MESSAGE = "Enter your password to delete.";
