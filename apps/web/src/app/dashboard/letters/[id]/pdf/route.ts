import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { renderLetterPdf } from "@/lib/letter/letter-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** A letter on the letterhead. Staff only: the API checks the forwarded session. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const cookie = (await headers()).get("cookie") ?? "";
  let letter;
  try {
    letter = await apiWithCookie(cookie).letters.byId.query(decodeURIComponent(id));
  } catch {
    return new Response("Letter not found", { status: 404 });
  }
  const pdf = await renderLetterPdf(letter);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Forest-Creek-${letter.label}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
