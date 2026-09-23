import { deliverDueNotifications } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { isMailConfigured, sendEmail } from "@forest-creek/mail";

/** Often enough that a guest's "payment pending" email arrives while they are still at the screen. */
const DELIVER_EVERY_MS = 30_000;

/**
 * Sends queued booking emails from the API process. The WhatsApp agent writes
 * to the same outbox but never sends — only this process holds SMTP
 * credentials, and only one thing needs to.
 *
 * Runs never overlap, so a slow mail server cannot stack deliveries.
 */
export function startNotificationWorker(): () => void {
  let running = false;
  const configured = isMailConfigured();
  if (!configured) {
    console.log("[mail] SMTP is not configured; booking emails will be marked skipped");
  }

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { sent, retrying, failed, skipped } = await deliverDueNotifications({
        send: sendEmail,
        configured,
      });
      if (sent || retrying || failed || skipped) {
        console.log(`[mail] sent ${sent}, retrying ${retrying}, failed ${failed}, skipped ${skipped}`);
      }
    } catch (error) {
      console.error(`[mail] delivery run failed: ${describeError(error)}`);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, DELIVER_EVERY_MS);
  return () => clearInterval(timer);
}
