import { confirmChargesInFlight, sendBalanceReminders, closeUnpaidPastArrival } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";

/** Often enough that a paid charge whose page was closed is confirmed within minutes. */
const SWEEP_EVERY_MS = 2 * 60_000;

/**
 * Confirms charges Paynow reports paid (confirmChargesInFlight) and closes
 * unpaid bookings whose arrival passed (closeUnpaidPastArrival), on a timer in the
 * API process. Availability never depends on this.
 *
 * Runs never overlap: a slow Paynow poll must not stack a second sweep on top.
 */
export function startHoldSweeper(): () => void {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const confirmed = await confirmChargesInFlight();
      if (confirmed) console.log(`[holds] confirmed ${confirmed} payment(s) Paynow reports paid`);
      const { expired } = await closeUnpaidPastArrival();
      if (expired) console.log(`[holds] closed ${expired} unpaid booking(s) whose arrival day passed`);
      // Rides the same timer: cheap, and each guest is reminded only once.
      const reminded = await sendBalanceReminders();
      if (reminded) console.log(`[holds] queued ${reminded} balance reminder(s)`);
    } catch (error) {
      console.error(`[holds] sweep failed: ${describeError(error)}`);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, SWEEP_EVERY_MS);
  return () => clearInterval(timer);
}
