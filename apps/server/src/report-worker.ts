import { queueDueReports } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";

/** Often enough that reports are in by a little after seven; each one is only queued once. */
const CHECK_EVERY_MS = 10 * 60_000;

/**
 * Puts due reports in the email outbox, from which the notification worker
 * sends and retries them. A restart at any hour picks up where it left off.
 * Runs never overlap.
 */
export function startReportWorker(): () => void {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const queued = await queueDueReports();
      if (queued) console.log(`[reports] queued ${queued} report email(s)`);
    } catch (error) {
      console.error(`[reports] run failed: ${describeError(error)}`);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, CHECK_EVERY_MS);
  return () => clearInterval(timer);
}
