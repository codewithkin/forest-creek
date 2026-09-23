import { env } from "@forest-creek/env/server";
import nodemailer, { type Transporter } from "nodemailer";

import { smtpOptions } from "./config";

export * from "./config";

export type Email = { to: string; subject: string; text: string };

export function isMailConfigured(): boolean {
  return smtpOptions(env) !== null;
}

let transporter: Transporter | undefined;

/**
 * Built on first use, not at import, so every app that imports this package
 * boots with mail unconfigured — same as Paynow and R2.
 */
function getTransporter(): { transporter: Transporter; from: string } {
  const options = smtpOptions(env);
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

/** Sends one plain-text email. Throws on failure; the outbox decides when to retry. */
export async function sendEmail(email: Email): Promise<void> {
  const { transporter, from } = getTransporter();
  await transporter.sendMail({ from, to: email.to, subject: email.subject, text: email.text });
}
