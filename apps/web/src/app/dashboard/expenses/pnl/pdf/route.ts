import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { renderPnlPdf } from "@/lib/expenses/pnl-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isMonth = (value: string | null): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

/** The profit & loss as a PDF. Owner only: the API checks the forwarded session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isMonth(from) || !isMonth(to)) return new Response("Not found", { status: 404 });

  const cookie = (await headers()).get("cookie") ?? "";
  const api = apiWithCookie(cookie);
  let pnl;
  try {
    pnl = await api.expenses.profitAndLoss.query({ from, to, propertyId: url.searchParams.get("propertyId") ?? undefined });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const pdf = await renderPnlPdf(pnl);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Forest Creek profit and loss ${from === to ? from : `${from} to ${to}`}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
