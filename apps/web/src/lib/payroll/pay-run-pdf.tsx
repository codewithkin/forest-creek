import type { ComponentProps } from "react";

import { Document, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";
import { LetterheadPage, letterheadStyles, pdfColors, TitleRow } from "@/lib/sheet/letterhead-pdf";

import { payRunSummary, type PayRunForSummary, type SummaryRow } from "./pay-run-summary";

/** A pay run's summary on the letterhead, grouped by category, as a PDF. Server-only; owner only. */

const columns: { key: keyof SummaryRow; label: string; flex: number; right?: boolean }[] = [
  { key: "name", label: "Name", flex: 2.1 },
  { key: "position", label: "Position", flex: 1.6 },
  { key: "basic", label: "Basic", flex: 0.95, right: true },
  { key: "extras", label: "Extras", flex: 0.95, right: true },
  { key: "deductions", label: "Less", flex: 0.9, right: true },
  { key: "net", label: "Net", flex: 1, right: true },
  { key: "method", label: "Paid by", flex: 1.05, right: true },
  { key: "status", label: "Status", flex: 1.25, right: true },
];

const s = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, fontSize: 9.5, color: pdfColors.soft },
  period: { fontSize: 13, fontWeight: 600, color: pdfColors.ink },
  group: { marginTop: 14 },
  groupTitle: { backgroundColor: pdfColors.forest, color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.8, textTransform: "uppercase", paddingVertical: 6, paddingHorizontal: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  head: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: pdfColors.hairline },
  headCell: { paddingLeft: 5, fontSize: 6.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: pdfColors.muted },
  row: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: pdfColors.hairline },
  cell: { paddingLeft: 5, fontSize: 8.2 },
  subtotal: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#F2F5F3" },
  total: { flexDirection: "row", marginTop: 16, paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: pdfColors.forest },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36, gap: 40 },
  signBox: { flex: 1, borderTopWidth: 1, borderTopColor: "#8A948F", paddingTop: 4, fontSize: 9 },
});

function Row({ row, style, bold }: { row: SummaryRow; style: ComponentProps<typeof View>["style"]; bold?: boolean }) {
  return (
    <View style={style} wrap={false}>
      {columns.map((column) => (
        <Text key={column.key} style={[s.cell, { flex: column.flex, textAlign: column.right ? "right" : "left", fontWeight: bold ? 600 : 400 }]}>
          {row[column.key]}
        </Text>
      ))}
    </View>
  );
}

function Head() {
  return (
    <View style={s.head}>
      {columns.map((column) => (
        <Text key={column.key} style={[s.headCell, { flex: column.flex, textAlign: column.right ? "right" : "left" }]}>
          {column.label}
        </Text>
      ))}
    </View>
  );
}

function PayRunDocument({ run }: { run: PayRunForSummary }) {
  const summary = payRunSummary(run);
  return (
    <Document title={`Payroll ${summary.period}`} author="Forest Creek" creator="Forest Creek">
      <LetterheadPage from={summary.from}>
        <TitleRow title="PAYROLL" numberLabel="Pay run" number={summary.number} />
        <View style={s.meta}>
          <Text style={s.period}>{summary.period}</Text>
          <Text>
            {summary.people} people · {summary.paidCount} paid · {summary.signedCount} signed
          </Text>
        </View>
        {summary.groups.map((group) => (
          <View key={group.category} style={s.group}>
            <View wrap={false}>
              <Text style={s.groupTitle}>{group.category}</Text>
              <Head />
            </View>
            {group.rows.map((row, index) => (
              <Row key={index} row={row} style={s.row} />
            ))}
            <Row row={group.subtotal} style={s.subtotal} bold />
          </View>
        ))}
        <Row row={summary.total} style={s.total} bold />
        <View style={s.signRow} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={[letterheadStyles.label, { marginBottom: 22 }]}>Prepared by</Text>
            <Text style={s.signBox}>{summary.preparedBy}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[letterheadStyles.label, { marginBottom: 22 }]}>Approved by</Text>
            <Text style={s.signBox}> </Text>
          </View>
        </View>
      </LetterheadPage>
    </Document>
  );
}

export async function renderPayRunPdf(run: PayRunForSummary): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<PayRunDocument run={run} />);
}
