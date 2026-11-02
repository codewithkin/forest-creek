import { uniquePaths, ZipWriter } from "@forest-creek/storage/zip";
import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/invoice/invoice-document";
import { renderLetterPdf } from "@/lib/letter/letter-pdf";
import { renderQuotePdf } from "@/lib/quote/quote-document";
import { renderRegistrationPdf } from "@/lib/registration/registration-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX = 200;
const KINDS = ["invoice", "quote", "letter", "registration"] as const;
type Kind = (typeof KINDS)[number];
const TITLES: Record<Kind, string> = {
  invoice: "Forest Creek invoices",
  quote: "Forest Creek quotations",
  letter: "Forest Creek letters",
  registration: "Forest Creek registration cards",
};

/**
 * Several invoices, quotations, letters or registration cards as one zip of PDFs, for a selection's
 * "Download". Each is read as the staff member whose cookie this is, so the
 * API's scope check applies to every one; one it refuses is left out and
 * listed, not fatal.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => /^[a-z0-9]{10,40}$/i.test(id)).slice(0, MAX);
  if (!KINDS.includes(kind as Kind) || ids.length === 0) return new Response("Nothing chosen to download", { status: 400 });

  const client = apiWithCookie((await headers()).get("cookie") ?? "");
  const rendered: { name: string; bytes: Uint8Array }[] = [];
  const missed: string[] = [];
  for (const id of ids) {
    try {
      if (kind === "invoice") {
        const invoice = await client.invoices.byId.query(id);
        rendered.push({ name: `${invoice.label} ${invoice.billedTo}.pdf`, bytes: new Uint8Array(await renderInvoicePdf(invoice)) });
      } else if (kind === "quote") {
        const quote = await client.quotes.byId.query(id);
        rendered.push({ name: `${quote.label} ${quote.guestName}.pdf`, bytes: new Uint8Array(await renderQuotePdf(quote)) });
      } else if (kind === "letter") {
        const letter = await client.letters.byId.query(id);
        rendered.push({ name: `${letter.label} ${letter.subject}.pdf`, bytes: new Uint8Array(await renderLetterPdf(letter)) });
      } else {
        const card = await client.registrations.byId.query(id);
        rendered.push({ name: `${card.label} ${card.guestName}.pdf`, bytes: new Uint8Array(await renderRegistrationPdf(card)) });
      }
    } catch {
      missed.push(id);
    }
  }
  if (rendered.length === 0) return new Response("Those documents aren't available", { status: 404 });

  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter((chunk) => void chunks.push(chunk));
  const names = uniquePaths(rendered.map((file) => file.name));
  for (const [index, file] of rendered.entries()) await zip.add(names[index]!, file.bytes);
  if (missed.length) await zip.add("_not-included.txt", new TextEncoder().encode(`${missed.length} couldn't be included. Open them one at a time to see why.\n`));
  await zip.finish();

  const title = TITLES[kind as Kind];
  return new Response(new Blob(chunks as BlobPart[]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${title}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
