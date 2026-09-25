import { api } from "@/lib/api";
import { renderReceiptPdf } from "@/lib/receipt/receipt-document";

// Rendered per request from the API: a receipt is never baked into the build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The guest's receipt as a branded PDF. Downloads by default; ?view=1 opens it
 * in the browser instead. The id is the receipt's own unguessable key.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  let receipt;
  try {
    receipt = await api.receipts.byId.query(decodeURIComponent(id));
  } catch {
    return new Response("Receipt not found", { status: 404 });
  }

  const pdf = await renderReceiptPdf(receipt);
  const inline = new URL(request.url).searchParams.has("view");
  const filename = `Forest-Creek-receipt-${receipt.number}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      // Never listed by search engines, whatever links to it.
      "X-Robots-Tag": "noindex",
    },
  });
}
