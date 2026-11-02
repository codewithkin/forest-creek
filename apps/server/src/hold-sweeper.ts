import {
  autoCheckOutPastStays,
  closeUnpaidPastArrival,
  confirmChargesInFlight,
  expireQuotes,
  remindQuotes,
  sendBalanceReminders,
} from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { purgeFiles } from "@forest-creek/api/file-jobs";

/** Often enough that a paid charge whose page was closed is confirmed within minutes. */
const SWEEP_EVERY_MS = 2 * 60_000;

/** One failed job is logged and the rest still run. */
async function attempt<T>(name: string, job: () => Promise<T>): Promise<T | undefined> {
  try {
    return await job();
  } catch (error) {
    console.error(`[holds] ${name} failed: ${describeError(error)}`);
    return undefined;
  }
}

/**
 * The background work that keeps bookings true, on a timer in the API process:
 * confirms charges Paynow reports paid, closes unpaid bookings whose arrival
 * passed, sends balance reminders and checks out finished stays. Availability
 * never depends on it, and every job is safe to run again.
 *
 * Runs never overlap: a slow Paynow poll must not stack a second sweep on top.
 */
export function startHoldSweeper(): () => void {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const confirmed = await attempt("confirming charges", () => confirmChargesInFlight());
      if (confirmed) console.log(`[holds] confirmed ${confirmed} payment(s) Paynow reports paid`);
      const closed = await attempt("closing unpaid bookings", () => closeUnpaidPastArrival());
      if (closed?.expired) console.log(`[holds] closed ${closed.expired} unpaid booking(s) whose arrival day passed`);
      // Cheap, and each guest is reminded only once.
      const reminded = await attempt("balance reminders", () => sendBalanceReminders());
      if (reminded) console.log(`[holds] queued ${reminded} balance reminder(s)`);
      const checkedOut = await attempt("automatic check-out", () => autoCheckOutPastStays());
      if (checkedOut) console.log(`[holds] checked out ${checkedOut} finished stay(s)`);
      const expired = await attempt("expiring quotations", () => expireQuotes());
      if (expired) console.log(`[holds] closed ${expired} expired quotation(s)`);
      const nudged = await attempt("quotation reminders", () => remindQuotes());
      if (nudged) console.log(`[holds] queued ${nudged} quotation reminder(s)`);
      const purged = await attempt("purging files", () => purgeFiles());
      if (purged) console.log(`[holds] removed ${purged} file(s) from storage`);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, SWEEP_EVERY_MS);
  return () => clearInterval(timer);
}
