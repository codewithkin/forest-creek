import { env } from "@forest-creek/env/server";
import nodemailer, { type Transporter } from "nodemailer";

import { smtpOptions, type SmtpEnv } from "./config";

/**
 * SMTP_PASSWORD is accepted as well as SMTP_PASS: it is the name most hosting
 * dashboards (and this team's other apps) use, and a deploy that set the
 * "wrong" one sent nothing while looking configured.
 */
function smtpEnv(): SmtpEnv {
  return { ...env, SMTP_PASS: env.SMTP_PASS ?? env.SMTP_PASSWORD };
}

export * from "./config";
export * from "./layout";

export type Email = {
  to: string;
  subject: string;
  text: string;
  /** The branded HTML part; mail clients that can't show it fall back to `text`. */
  html?: string;
  /** Where replies go, when that should differ from the sender. */
  replyTo?: string;
  /**
   * Files sent with the message. An image with a `cid` is shown inside the
   * HTML (`<img src="cid:…">`) without the mail client fetching anything.
   */
  attachments?: { filename: string; content: Buffer; contentType: string; cid?: string }[];
};

export function isMailConfigured(): boolean {
  return smtpOptions(smtpEnv()) !== null;
}

let transporter: Transporter | undefined;

/**
 * Built on first use, not at import, so every app that imports this package
 * boots with mail unconfigured — same as Paynow and R2.
 */
function getTransporter(): { transporter: Transporter; from: string } {
  const options = smtpOptions(smtpEnv());
  if (!options) throw new Error("Email is not configured: set SMTP_HOST and SMTP_FROM.");
  transporter ??= nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    // A hung mail server must fail the attempt, not stall the delivery loop.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return { transporter, from: options.from };
}

/** Sends one email (text, plus HTML when given). Throws on failure; the outbox decides when to retry. */
export async function sendEmail(email: Email): Promise<void> {
  const { transporter, from } = getTransporter();
  await transporter.sendMail({
    from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: email.replyTo,
    attachments: email.attachments?.map((file) => ({ ...file, contentDisposition: "inline" as const })),
  });
}

export type MailCheck = { ok: true } | { ok: false; error: string };

/**
 * Connects and authenticates without sending anything, so a wrong host, port,
 * password or TLS setting shows up in the server log at boot — not as a
 * silent stack of "retrying" emails nobody notices.
 */
export async function verifyMailConnection(): Promise<MailCheck> {
  try {
    const { transporter } = getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
