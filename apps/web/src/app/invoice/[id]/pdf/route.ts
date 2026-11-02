import { api } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/invoice/invoice-document";

// Rendered per request from the API: an invoice is never baked into the build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** An invoice as a PDF, the link in its email. The id is its own unguessable key, like a receipt's. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  let invoice;
  try {
    invoice = await api.invoices.view.query(decodeURIComponent(id));
  } catch {
    return new Response("Invoice not found", { status: 404 });
  }

  const pdf = await renderInvoicePdf(invoice);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Forest-Creek-${invoice.label}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
