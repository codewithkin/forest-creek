import { BRAND_LINE, fromProperty, sheetDay } from "@/lib/sheet/document-sheet";

/**
 * A letter on the letterhead: the brand and address at the top, the date and
 * reference, who it is to, the subject, the words in paragraphs, the sign-off.
 * Staff type only the words; this lays them out. Import-free.
 */

export type LetterInputForLayout = {
  label: string;
  recipient: string;
  subject: string;
  body: string;
  closing: string;
  signerName: string;
  signerTitle: string | null;
  letterDate: string;
  property: { name: string; location: string; phone: string; email: string };
};

export type LetterLayout = {
  from: { lines: string[]; phone: string; email: string };
  footerLine: string;
  footerName: string;
  reference: string;
  date: string;
  recipient: string[];
  subject: string;
  paragraphs: string[];
  closing: string;
  signerName: string;
  signerTitle: string | null;
};

/** Blank lines separate paragraphs; single line breaks stay inside one (an address, a list). */
export function paragraphsOf(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function letterLayout(letter: LetterInputForLayout): LetterLayout {
  const { from, footerName } = fromProperty(letter.property);
  return {
    from: { ...from, email: letter.property.email },
    footerLine: BRAND_LINE,
    footerName,
    reference: letter.label,
    date: sheetDay(letter.letterDate, "long"),
    recipient: letter.recipient.split("\n").map((line) => line.trim()).filter(Boolean),
    subject: letter.subject.trim(),
    paragraphs: paragraphsOf(letter.body),
    closing: letter.closing.trim() || "Yours faithfully",
    signerName: letter.signerName.trim(),
    signerTitle: letter.signerTitle?.trim() || null,
  };
}
