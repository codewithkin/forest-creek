import { expect, test } from "bun:test";
import pg from "pg";

import { acquireSingletonLock } from "./singleton-lock";

const connectionString = process.env.DATABASE_URL!;
const NAME = `singleton-lock-test-${Math.random()}`;

test("a second holder waits until the first releases, then gets it", async () => {
  const first = await acquireSingletonLock(NAME, { connectionString });
  let waitingTold = false;
  let secondGotIt = false;
  const second = acquireSingletonLock(NAME, {
    connectionString,
    pollMs: 50,
    onWaiting: () => (waitingTold = true),
  }).then((lock) => {
    secondGotIt = true;
    return lock;
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(secondGotIt).toBe(false);
  expect(waitingTold).toBe(true);

  await first.release();
  const lock = await second;
  expect(secondGotIt).toBe(true);
  await lock.release();
});

test("a holder that dies without releasing frees the lock with its connection", async () => {
  // Stand in for a killed container: take the lock on a raw connection and drop it.
  const doomed = new pg.Client({ connectionString });
  await doomed.connect();
  await doomed.query("SELECT pg_advisory_lock(hashtext($1))", [NAME]);
  const next = acquireSingletonLock(NAME, { connectionString, pollMs: 50 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await doomed.end();
  const lock = await next;
  await lock.release();
});
