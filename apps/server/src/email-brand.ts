import { readFileSync } from "node:fs";
import path from "node:path";

import { brand } from "@forest-creek/ai/brand";
import { env } from "@forest-creek/env/server";
import { documentFromText, renderEmailHtml, type EmailBrand, type EmailDocument } from "@forest-creek/mail";

const siteUrl = env.CORS_ORIGIN.replace(/\/$/, "");

const LOGO_CID = "logo@forestcreek.co.zw";

/**
 * The logo travels inside every email. Linked from the website it showed in
 * some inboxes and not others: Gmail held it back behind "Show pictures" on
 * the staff copies, leaving the alt text in an empty circle.
 */
function loadLogo(): Buffer | undefined {
  try {
    // The server runs from apps/server, in dev and in the image alike.
    return readFileSync(path.join(process.cwd(), "public", "email", "logo.png"));
  } catch {
    console.warn("[mail] public/email/logo.png not found — emails will link the logo from the website instead");
    return undefined;
  }
}

const logo = loadLogo();

/** Sent with every email, so the logo shows without the reader allowing remote images. */
export const emailAttachments = logo
  ? [{ filename: "forest-creek.png", content: logo, contentType: "image/png", cid: LOGO_CID }]
  : [];

/**
 * The brand every email is sent in. The facts come from packages/ai's brand
 * (the same ones the assistants quote); the logo is the attachment above, or
 * the website's copy if that file is missing.
 */
export const emailBrand: EmailBrand = {
  name: brand.groupName,
  tagline: brand.tagline,
  siteUrl,
  logoUrl: logo ? `cid:${LOGO_CID}` : `${siteUrl}/email/logo.png`,
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
