/**
 * The one layout every Forest Creek email is sent in.
 *
 * An email is written once, as an EmailDocument — a title and a list of
 * blocks — and rendered twice from it: a plain-text part (what is stored in
 * the outbox and what old mail clients show) and a branded HTML part. Keeping
 * both derived from one document means the two can never say different
 * things, and every message, guest or staff, stay or day visit, gets the same
 * header, spacing and footer.
 *
 * Import-free (no env, no nodemailer), so it is unit tested and can be
 * imported by packages/db, where the wording lives. The brand facts are passed
 * in by the API server at send time, so the footer can change without
 * re-queueing anything.
 *
 * The HTML is written for email clients, not browsers: tables for layout,
 * inline styles only, no web fonts or external CSS, a 600px column, and a
 * light colour scheme declared so Outlook and Gmail's dark modes don't invert
 * the brand colours into something unreadable.
 */

export type EmailBlock =
  /** A paragraph. URLs in it become links. */
  | { kind: "text"; text: string }
  /** Label/value rows — the booking at a glance. */
  | { kind: "details"; rows: Array<[label: string, value: string]> }
  /** A call to action. Primary is the one thing the reader should do. */
  | { kind: "button"; label: string; url: string; primary?: boolean }
  /** Something the reader must not miss: a deadline, a refund, a warning. */
  | { kind: "callout"; text: string }
  /** A quieter link, for things worth having but not the point of the email. */
  | { kind: "link"; label: string; url: string };

export type EmailDocument = {
  /** Shown by most inboxes next to the subject; never visible in the body. */
  preheader?: string;
  /** Short eyebrow above the title, e.g. "Payment pending". */
  eyebrow?: string;
  /** The headline. */
  title: string;
  /** "Hello Tariro," — omitted for staff messages. */
  greeting?: string;
  blocks: EmailBlock[];
  /** The name the email is signed with. */
  signature?: string;
  /** Number to quote in the sign-off. Omitted for staff messages. */
  contactPhone?: string;
};

export type EmailBrand = {
  name: string;
  tagline: string;
  /** The public website, e.g. https://forestcreek.co.zw — no trailing slash needed. */
  siteUrl: string;
  /** Absolute URL of a square logo, shown round at 64px (supply 128px or more). */
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  socials: ReadonlyArray<{ label: string; href: string }>;
};

// Brand palette, from packages/ui's theme: the site's deep forest green, its
// gold accent, and a soft sage page so the white card reads as paper.
const COLOR = {
  page: "#EEF1EC",
  card: "#FFFFFF",
  cardBorder: "#DDE3DC",
  forest: "#0B2E27",
  forestSoft: "#16453B",
  gold: "#F6D278",
  goldDeep: "#B8892B",
  text: "#23322E",
  muted: "#63726C",
  panel: "#F4F7F2",
  panelBorder: "#E1E7DF",
  calloutBg: "#FFF8E6",
  onForestMuted: "#A9C4BA",
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

/**
 * The text part. Deliberately close to how a person would type it: blank
 * lines between blocks, "Label: value" rows, and links written out in full so
 * they survive clients that strip formatting.
 */
export function renderEmailText(doc: EmailDocument): string {
  const parts: string[] = [];
  if (doc.greeting) parts.push(doc.greeting);

  for (const block of doc.blocks) {
    switch (block.kind) {
      case "text":
      case "callout":
        parts.push(block.text);
        break;
      case "details":
        parts.push(block.rows.map(([label, value]) => `${label}: ${value}`).join("\n"));
        break;
      case "button":
      case "link":
        parts.push(`${block.label}: ${block.url}`);
        break;
    }
  }

  const closing: string[] = [];
  if (doc.contactPhone) closing.push(`Questions? Reply to this email or call ${doc.contactPhone}.`);
  if (doc.signature) closing.push(doc.signature);
  if (closing.length > 0) parts.push(closing.join("\n\n"));

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_PATTERN = /https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/g;

/** Escapes text, then turns any URLs in it into links. */
function linkify(text: string): string {
  let html = "";
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(last, index));
    html += `<a href="${escapeHtml(url)}" style="color:${COLOR.forestSoft};text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a>`;
    last = index + url.length;
  }
  html += escapeHtml(text.slice(last));
  return html.replace(/\n/g, "<br>");
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

const paragraphStyle = `margin:0 0 18px;font-family:${FONT};font-size:16px;line-height:26px;color:${COLOR.text};`;

function renderBlock(block: EmailBlock): string {
  switch (block.kind) {
    case "text":
      return `<p style="${paragraphStyle}">${linkify(block.text)}</p>`;

    case "callout":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;border-collapse:separate;">
  <tr>
    <td style="background-color:${COLOR.calloutBg};border-left:4px solid ${COLOR.goldDeep};border-radius:8px;padding:14px 18px;font-family:${FONT};font-size:15px;line-height:24px;color:${COLOR.text};">${linkify(block.text)}</td>
  </tr>
</table>`;

    case "details": {
      const rows = block.rows
        .map(([label, value], index) => {
          const divider = index === 0 ? "" : `border-top:1px solid ${COLOR.panelBorder};`;
          return `<tr>
      <td valign="top" style="${divider}padding:11px 0;width:32%;font-family:${FONT};font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:${COLOR.muted};">${escapeHtml(label)}</td>
      <td valign="top" style="${divider}padding:11px 0 11px 12px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${COLOR.text};">${linkify(value)}</td>
    </tr>`;
        })
        .join("\n");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-collapse:separate;">
  <tr>
    <td style="background-color:${COLOR.panel};border:1px solid ${COLOR.panelBorder};border-radius:12px;padding:6px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    ${rows}
      </table>
    </td>
  </tr>
</table>`;
    }

    case "button": {
      const primary = block.primary !== false;
      const bg = primary ? COLOR.gold : COLOR.card;
      const border = primary ? COLOR.gold : COLOR.forest;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border:2px solid ${border};border-radius:999px;">
      <a href="${escapeHtml(block.url)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:${COLOR.forest};text-decoration:none;border-radius:999px;">${escapeHtml(block.label)} &rarr;</a>
    </td>
  </tr>
</table>`;
    }

    case "link":
      return `<p style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:22px;color:${COLOR.muted};">${escapeHtml(block.label)}: <a href="${escapeHtml(block.url)}" target="_blank" style="color:${COLOR.forestSoft};text-decoration:underline;">${escapeHtml(prettyUrl(block.url))}</a></p>`;
  }
}

/** "https://forestcreek.co.zw/policies" reads better as "forestcreek.co.zw/policies". */
function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The full HTML part of an email, in the Forest Creek layout. */
export function renderEmailHtml(doc: EmailDocument, brand: EmailBrand): string {
  const site = brand.siteUrl.replace(/\/$/, "");
  const siteLabel = prettyUrl(site);

  const eyebrow = doc.eyebrow
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.goldDeep};">${escapeHtml(doc.eyebrow)}</p>`
    : "";
  const greeting = doc.greeting ? `<p style="${paragraphStyle}">${escapeHtml(doc.greeting)}</p>` : "";

  const closingLines: string[] = [];
  if (doc.contactPhone) {
    closingLines.push(
      `Questions? Simply reply to this email or call <a href="${telHref(doc.contactPhone)}" style="color:${COLOR.forestSoft};font-weight:600;text-decoration:none;">${escapeHtml(doc.contactPhone)}</a>.`,
    );
  }
  const closing =
    closingLines.length > 0 || doc.signature
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-top:1px solid ${COLOR.panelBorder};">
  <tr>
    <td style="padding-top:22px;font-family:${FONT};font-size:15px;line-height:24px;color:${COLOR.text};">
      ${closingLines.map((line) => `<p style="margin:0 0 14px;">${line}</p>`).join("")}
      ${doc.signature ? `<p style="margin:0;">Warm regards,<br><span style="font-family:${SERIF};font-size:18px;line-height:28px;color:${COLOR.forest};">${escapeHtml(doc.signature)}</span></p>` : ""}
    </td>
  </tr>
</table>`
      : "";

  const socials = brand.socials
    .map(
      (social) =>
        `<a href="${escapeHtml(social.href)}" target="_blank" style="color:${COLOR.forestSoft};text-decoration:none;font-weight:600;">${escapeHtml(social.label)}</a>`,
    )
    .join(`<span style="color:${COLOR.cardBorder};">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(doc.title)}</title>
<style>
  body { margin:0; padding:0; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .fc-shell { padding:0 !important; }
    .fc-card { border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .fc-pad { padding-left:22px !important; padding-right:22px !important; }
    .fc-title { font-size:26px !important; line-height:32px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.page};">${escapeHtml(doc.preheader ?? doc.title)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.page}" style="background-color:${COLOR.page};">
  <tr>
    <td align="center" class="fc-shell" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="fc-card" style="width:100%;max-width:600px;background-color:${COLOR.card};border:1px solid ${COLOR.cardBorder};border-radius:16px;overflow:hidden;border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="${COLOR.forest}" style="background-color:${COLOR.forest};padding:30px 24px 26px;">
            <a href="${escapeHtml(site)}" target="_blank" style="text-decoration:none;">
              <img src="${escapeHtml(brand.logoUrl)}" width="64" height="64" alt="${escapeHtml(brand.name)}" style="display:block;margin:0 auto 12px;width:64px;height:64px;border-radius:50%;">
              <span style="display:block;font-family:${SERIF};font-size:26px;line-height:30px;letter-spacing:0.02em;color:${COLOR.gold};">${escapeHtml(brand.name)}</span>
              <span style="display:block;margin-top:6px;font-family:${FONT};font-size:11px;line-height:14px;letter-spacing:0.22em;text-transform:uppercase;color:${COLOR.onForestMuted};">${escapeHtml(brand.tagline)}</span>
            </a>
          </td>
        </tr>
        <tr>
          <td height="4" bgcolor="${COLOR.gold}" style="background-color:${COLOR.gold};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td class="fc-pad" style="padding:36px 40px 34px;">
            ${eyebrow}
            <h1 class="fc-title" style="margin:0 0 22px;font-family:${SERIF};font-size:30px;line-height:36px;font-weight:normal;color:${COLOR.forest};">${escapeHtml(doc.title)}</h1>
            ${greeting}
            ${doc.blocks.map(renderBlock).join("\n            ")}
            ${closing}
          </td>
        </tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td align="center" class="fc-pad" style="padding:26px 40px 8px;font-family:${FONT};font-size:13px;line-height:21px;color:${COLOR.muted};">
            <p style="margin:0 0 6px;font-family:${SERIF};font-size:16px;color:${COLOR.forest};">${escapeHtml(brand.name)}</p>
            <p style="margin:0 0 6px;">${escapeHtml(brand.address)}</p>
            <p style="margin:0 0 14px;">
              <a href="${telHref(brand.phone)}" style="color:${COLOR.forestSoft};text-decoration:none;">${escapeHtml(brand.phone)}</a>
              <span style="color:${COLOR.cardBorder};">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
              <a href="mailto:${escapeHtml(brand.email)}" style="color:${COLOR.forestSoft};text-decoration:none;">${escapeHtml(brand.email)}</a>
              <span style="color:${COLOR.cardBorder};">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
              <a href="${escapeHtml(site)}" target="_blank" style="color:${COLOR.forestSoft};text-decoration:none;">${escapeHtml(siteLabel)}</a>
            </p>
            ${socials ? `<p style="margin:0 0 14px;">${socials}</p>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * For outbox rows queued before emails had a document: the stored plain text,
 * in the same layout, one paragraph per blank-line-separated block.
 */
export function documentFromText(subject: string, text: string): EmailDocument {
  return {
    title: subject,
    blocks: text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({ kind: "text" as const, text: part })),
  };
}
