import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { renderRegistrationPdf } from "@/lib/registration/registration-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** A guest registration card. Staff only (it holds identity numbers): the API checks the forwarded session. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const cookie = (await headers()).get("cookie") ?? "";
  let card;
  try {
    card = await apiWithCookie(cookie).registrations.byId.query(decodeURIComponent(id));
  } catch {
    return new Response("Registration card not found", { status: 404 });
  }
  const pdf = await renderRegistrationPdf(card);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Forest-Creek-${card.label}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
