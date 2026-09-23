import { sendBalanceReminders, sweepLapsedHolds } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";

/** Often enough that the dashboard stops showing a lapsed hold as pending within minutes. */
const SWEEP_EVERY_MS = 2 * 60_000;

/**
 * Runs sweepLapsedHolds on a timer in the API process. Availability never
 * depends on this — every read already ignores a lapsed hold — so a missed or
 * failed run only delays the "expired" label and the last Paynow check.
 *
 * Runs never overlap: a slow Paynow poll must not stack a second sweep on top.
 */
export function startHoldSweeper(): () => void {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { expired, paidLate } = await sweepLapsedHolds();
      if (expired || paidLate) {
        console.log(`[holds] expired ${expired} lapsed hold(s); ${paidLate} paid just in time`);
      }
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
