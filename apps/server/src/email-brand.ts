import { brand } from "@forest-creek/ai/brand";
import { env } from "@forest-creek/env/server";
import { documentFromText, renderEmailHtml, type EmailBrand, type EmailDocument } from "@forest-creek/mail";

const siteUrl = env.CORS_ORIGIN.replace(/\/$/, "");

/**
 * The brand every email is sent in. The facts come from packages/ai's brand
 * (the same ones the assistants quote), the logo from the public website so
 * mail clients can load it.
 */
export const emailBrand: EmailBrand = {
  name: brand.groupName,
  tagline: brand.tagline,
  siteUrl,
  logoUrl: `${siteUrl}/email/logo.png`,
  address: brand.address,
  phone: brand.reservationsPhone,
  email: brand.reservationsEmail,
  socials: brand.socials,
};

/**
 * The one way an email is turned into HTML: its document in the shared
 * layout, or — for a message queued before emails had a document — its plain
 * text laid out the same way.
 */
export function emailHtml(subject: string, text: string, document?: EmailDocument): string {
  return renderEmailHtml(document ?? documentFromText(subject, text), emailBrand);
}
