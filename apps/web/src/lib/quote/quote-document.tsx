import { renderSheetPdf } from "@/lib/sheet/sheet-pdf";

import { quoteSheet, type QuoteSheetInput } from "./quote-sheet";

/** A quotation as a PDF, on the shared sheet. Server-only, rendered by /quote/[id]/pdf. */

export type QuoteData = QuoteSheetInput & { status: string };

export function renderQuotePdf(quote: QuoteData): Promise<Buffer> {
  return renderSheetPdf(quoteSheet(quote), { title: `${quote.property.name} quotation ${quote.label}`, author: quote.property.name });
}
