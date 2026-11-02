import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";
import { renderReportPdf } from "@/lib/report/report-document";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isPeriod = (value: string | null): value is "day" | "week" | "month" => value === "day" || value === "week" || value === "month";

/** A report as a PDF. The API checks the staff session, so a stranger gets a 404. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period");
  const date = url.searchParams.get("date");
  if (!isPeriod(period) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("Report not found", { status: 404 });
  }

  const cookie = (await headers()).get("cookie") ?? "";
  let report;
  try {
    report = await apiWithCookie(cookie).reports.get.query({ period, date, propertyId: url.searchParams.get("propertyId") ?? undefined });
  } catch {
    return new Response("Report not found", { status: 404 });
  }

  const pdf = await renderReportPdf(report);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Forest-Creek-report-${report.range.from}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
