import { signatories, type Signatory } from "@/lib/lodge";
import { fromProperty, sheetDay, type SheetFrom } from "@/lib/sheet/document-sheet";

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
  /** The signer's drawn signature (PNG data URL). */
  signature?: string | null;
  /** The lodge's round stamp beside the signature. */
  stamped?: boolean;
  letterDate: string;
  property: { name: string; location: string; phone: string; email: string };
};

export type LetterLayout = {
  from: SheetFrom;
  reference: string;
  date: string;
  recipient: string[];
  subject: string;
  paragraphs: string[];
  closing: string;
  signerName: string;
  signerTitle: string | null;
  signature: string | null;
  stamped: boolean;
  propertyName: string;
};

/** Blank lines separate paragraphs; single line breaks stay inside one (an address, a list). */
export function paragraphsOf(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** One of the lodge's officials, by the name typed (case and spacing aside). */
export function findSignatory(name: string): Signatory | undefined {
  const wanted = name.trim().replace(/\s+/g, " ").toLowerCase();
  return signatories.find((signatory) => signatory.name.toLowerCase() === wanted);
}

export function letterLayout(letter: LetterInputForLayout): LetterLayout {
  const official = findSignatory(letter.signerName);
  return {
    // A letter an official signs carries their own email and phones, as their letterhead does.
    from: fromProperty(letter.property, official ? [official.email ?? "", ...official.phones].filter(Boolean) : undefined),
    reference: letter.label,
    date: sheetDay(letter.letterDate, "long"),
    recipient: letter.recipient.split("\n").map((line) => line.trim()).filter(Boolean),
    subject: letter.subject.trim(),
    paragraphs: paragraphsOf(letter.body),
    closing: letter.closing.trim() || "Yours faithfully",
    signerName: letter.signerName.trim(),
    signerTitle: letter.signerTitle?.trim() || null,
    signature: letter.signature ?? null,
    stamped: letter.stamped ?? true,
    propertyName: letter.property.name,
  };
}
