/**
 * Turns the SMTP environment into transport options. Import-free, so the
 * port/TLS rules are unit tested without the validated environment — the
 * same split as packages/payments' gateway.ts.
 */

export type SmtpEnv = {
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
};

export type SmtpOptions = {
  host: string;
  port: number;
  /** Implicit TLS from the first byte; otherwise STARTTLS is upgraded to. */
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
};

/** Null when mail is not set up — the app still runs, emails are skipped. */
export function smtpOptions(env: SmtpEnv): SmtpOptions | null {
  if (!env.SMTP_HOST) return null;
  const port = env.SMTP_PORT ?? 587;
  const from = env.SMTP_FROM ?? env.SMTP_USER;
  // Without a sender address every message would be refused anyway.
  if (!from) return null;
  return {
    host: env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 and 25 start plain and upgrade.
    secure: port === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    from,
  };
}
