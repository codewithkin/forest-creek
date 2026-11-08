import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { periodName } from "@/lib/payroll/pay-run-summary";
import { renderPayRunPdf } from "@/lib/payroll/pay-run-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** A pay run's summary by category. Owner only: the API checks the forwarded session. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const cookie = (await headers()).get("cookie") ?? "";
  let run;
  try {
    run = await apiWithCookie(cookie).payroll.run.query(decodeURIComponent(id));
  } catch {
    return new Response("Pay run not found", { status: 404 });
  }
  const pdf = await renderPayRunPdf(run);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Payroll ${periodName(run.period)} ${run.label}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
