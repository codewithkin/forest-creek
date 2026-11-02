import { api } from "@/lib/api";
import { renderQuotePdf } from "@/lib/quote/quote-document";

// Rendered per request from the API: a quotation is never baked into the build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** A quotation as a branded PDF. The id is its own unguessable key, like a receipt's. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  let quote;
  try {
    quote = await api.quotes.view.query(decodeURIComponent(id));
  } catch {
    return new Response("Quotation not found", { status: 404 });
  }

  const pdf = await renderQuotePdf(quote);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Forest-Creek-${quote.label}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
