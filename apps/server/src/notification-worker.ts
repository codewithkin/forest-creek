import { deliverDueNotifications, type OutgoingEmail } from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import { isMailConfigured, sendEmail, verifyMailConnection } from "@forest-creek/mail";

import { emailAttachments, emailBrand, emailHtml } from "./email-brand";

/** Often enough that a guest's "payment pending" email arrives while they are still at the screen. */
const DELIVER_EVERY_MS = 30_000;

/** Every queued email goes out as text plus the branded HTML, replies to the reservations inbox. */
function sendBranded(email: OutgoingEmail): Promise<void> {
  return sendEmail({
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: emailHtml(email.subject, email.text, email.document),
    replyTo: emailBrand.email,
    attachments: emailAttachments,
  });
}

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
    console.log("[mail] SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS); booking emails will be marked skipped");
  } else {
    // Say at boot whether the mail server accepts us — a wrong password or
    // port otherwise only shows up as emails quietly retrying.
    void verifyMailConnection().then((check) => {
      if (check.ok) console.log("[mail] SMTP connection verified");
      else console.error(`[mail] SMTP connection FAILED — no email will send until this is fixed: ${check.error}`);
    });
  }

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { sent, retrying, failed, skipped } = await deliverDueNotifications({
        send: sendBranded,
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
