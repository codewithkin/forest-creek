import { renderSheetPdf } from "@/lib/sheet/sheet-pdf";

import { invoiceSheet, type InvoiceSheetInput } from "./invoice-sheet";

/** An invoice as a PDF, on the shared sheet. Server-only. */
export function renderInvoicePdf(invoice: InvoiceSheetInput): Promise<Buffer> {
  return renderSheetPdf(invoiceSheet(invoice), { title: `${invoice.property.name} invoice ${invoice.label}`, author: invoice.property.name });
}
