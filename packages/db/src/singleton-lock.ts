import pg from "pg";

/**
 * One holder at a time, across containers — a Postgres advisory lock held on
 * its own connection for as long as the holder lives.
 *
 * Why: Coolify deploys by starting the new container while the old one is
 * still running. Two WhatsApp agents then open the same linked device at
 * once, take it from each other, and the survivor ends up stuck until staff
 * press Restart. Held through this lock, the new agent waits until the old one
 * has saved its session and exited.
 *
 * Not through Prisma: an advisory lock belongs to one database connection, and
 * Prisma's pool hands queries to whichever connection is free. If the process
 * dies, its connection closes and Postgres frees the lock by itself.
 */
export type SingletonLock = { release: () => Promise<void> };

export async function acquireSingletonLock(
  name: string,
  options: {
    connectionString: string;
    /** How often to try again while someone else holds it. */
    pollMs?: number;
    /** Told once when the lock turns out to be taken, and then every minute. */
    onWaiting?: (waitedMs: number) => void;
    /** Told if the lock's connection drops — the lock is gone with it. */
    onLost?: (error: Error) => void;
  },
): Promise<SingletonLock> {
  const pollMs = options.pollMs ?? 3_000;
  const client = new pg.Client({ connectionString: options.connectionString, keepAlive: true });
  let released = false;
  client.on("error", (error) => {
    if (!released) options.onLost?.(error);
  });
  await client.connect();

  const startedAt = Date.now();
  let lastTold = -Infinity;
  for (;;) {
    const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [name]);
    if (rows[0]?.locked) break;
    const waited = Date.now() - startedAt;
    if (waited - lastTold >= 60_000) {
      lastTold = waited;
      options.onWaiting?.(waited);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    async release() {
      if (released) return;
      released = true;
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [name]).catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}
