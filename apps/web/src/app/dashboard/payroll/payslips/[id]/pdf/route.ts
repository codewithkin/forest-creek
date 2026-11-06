import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { renderPayslipPdf } from "@/lib/payroll/payslip-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** A payslip. Owner only: the API checks the forwarded session. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const cookie = (await headers()).get("cookie") ?? "";
  let slip;
  try {
    slip = await apiWithCookie(cookie).payroll.payslip.query(decodeURIComponent(id));
  } catch {
    return new Response("Payslip not found", { status: 404 });
  }
  const pdf = await renderPayslipPdf(slip);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Payslip ${slip.payRun.period} ${slip.employeeName.replace(/[^\w .-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
