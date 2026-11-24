import type { ComponentProps } from "react";

import { Document, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { lodge } from "@/lib/lodge";
import { registerFonts } from "@/lib/receipt/receipt-document";
import { fromProperty, sheetMoney } from "@/lib/sheet/document-sheet";
import { LetterheadPage, letterheadStyles, pdfColors, TitleRow } from "@/lib/sheet/letterhead-pdf";

/** The profit & loss on the letterhead, month by month. Server-only; owner only. */

type Figures = { bookings: number; invoices: number; moneyIn: number; refunds: number; expenses: number; wages: number; moneyOut: number; profit: number; margin: number | null };

export type PnlForPdf = {
  from: string;
  to: string;
  property: { name: string; location: string; phone: string; email: string } | null;
  months: (Figures & { month: string; label: string })[];
  total: Figures;
  expensesByCategory: { category: string; cents: number; share: number }[];
};

const dollars = (cents: number) => sheetMoney(cents / 100);
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

const columns: { key: keyof Figures | "label"; label: string; flex: number }[] = [
  { key: "label", label: "Month", flex: 1.7 },
  { key: "moneyIn", label: "Money in", flex: 1 },
  { key: "expenses", label: "Expenses", flex: 1 },
  { key: "wages", label: "Wages", flex: 1 },
  { key: "refunds", label: "Refunds", flex: 0.9 },
  { key: "moneyOut", label: "Money out", flex: 1 },
  { key: "profit", label: "Profit", flex: 1 },
];

const s = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, fontSize: 9.5, color: pdfColors.soft },
  period: { fontSize: 13, fontWeight: 600, color: pdfColors.ink },
  figures: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  figure: { width: "23.5%", borderWidth: 0.75, borderColor: pdfColors.hairline, borderRadius: 6, padding: 9 },
  figureValue: { fontSize: 15, fontWeight: 600, marginTop: 4 },
  sectionTitle: { marginTop: 16, backgroundColor: pdfColors.forest, color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.8, textTransform: "uppercase", paddingVertical: 6, paddingHorizontal: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  head: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: pdfColors.hairline },
  headCell: { paddingLeft: 5, fontSize: 6.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: pdfColors.muted },
  row: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: pdfColors.hairline },
  cell: { paddingLeft: 5, fontSize: 8.2 },
  total: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: pdfColors.forest },
  note: { marginTop: 14, fontSize: 7.8, color: pdfColors.muted, lineHeight: 1.5 },
});

function MonthRow({ row, style, bold }: { row: Figures & { label: string }; style: ComponentProps<typeof View>["style"]; bold?: boolean }) {
  return (
    <View style={style} wrap={false}>
      {columns.map((column) => (
        <Text
          key={column.key}
          style={[s.cell, { flex: column.flex, textAlign: column.key === "label" ? "left" : "right", fontWeight: bold ? 600 : 400, color: column.key === "profit" && row.profit < 0 ? pdfColors.clay : pdfColors.ink }]}
        >
          {column.key === "label" ? row.label : dollars(row[column.key] as number)}
        </Text>
      ))}
    </View>
  );
}

function PnlDocument({ pnl }: { pnl: PnlForPdf }) {
  const property = pnl.property ?? { name: lodge.name, location: lodge.address, phone: lodge.phone, email: lodge.email };
  const period = pnl.from === pnl.to ? monthName(pnl.from) : `${monthName(pnl.from)} – ${monthName(pnl.to)}`;
  const { total } = pnl;
  return (
    <Document title={`Profit and loss ${period}`} author="Forest Creek" creator="Forest Creek">
      <LetterheadPage from={fromProperty(property)}>
        <TitleRow title="PROFIT & LOSS" numberLabel="Period" number={pnl.from === pnl.to ? pnl.from : `${pnl.from} to ${pnl.to}`} />
        <View style={s.meta}>
          <Text style={s.period}>{period}</Text>
          <Text>{pnl.property ? pnl.property.name : "All properties"}</Text>
        </View>

        <View style={s.figures} wrap={false}>
          {[
            { label: "Money in", value: dollars(total.moneyIn) },
            { label: "Money out", value: dollars(total.moneyOut) },
            { label: total.profit < 0 ? "Loss" : "Profit", value: dollars(total.profit) },
            { label: "Margin", value: total.margin === null ? "—" : `${Math.round(total.margin * 100)}%` },
          ].map((figure) => (
            <View key={figure.label} style={s.figure}>
              <Text style={letterheadStyles.label}>{figure.label}</Text>
              <Text style={s.figureValue}>{figure.value}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <Text style={s.sectionTitle}>Month by month</Text>
          <View style={s.head}>
            {columns.map((column) => (
              <Text key={column.key} style={[s.headCell, { flex: column.flex, textAlign: column.key === "label" ? "left" : "right" }]}>
                {column.label}
              </Text>
            ))}
          </View>
        </View>
        {pnl.months.map((row) => (
          <MonthRow key={row.month} row={row} style={s.row} />
        ))}
        <MonthRow row={{ ...total, label: "Total" }} style={s.total} bold />

        <View style={s.meta} wrap={false}>
          <Text>
            Money in: booking payments {dollars(total.bookings)}, paid invoices {dollars(total.invoices)}
          </Text>
        </View>

        {pnl.expensesByCategory.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>Expenses by category</Text>
            {pnl.expensesByCategory.map((row) => (
              <View key={row.category} style={s.row}>
                <Text style={[s.cell, { flex: 3 }]}>{row.category}</Text>
                <Text style={[s.cell, { flex: 1, textAlign: "right", color: pdfColors.muted }]}>{Math.round(row.share * 100)}%</Text>
                <Text style={[s.cell, { flex: 1, textAlign: "right" }]}>{dollars(row.cents)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.note}>
          Cash basis: money as it came in and went out in each month. Money in is booking payments received and paid invoices that are not for a
          booking; money out is expenses, wages paid (net) and refunds paid. Unpaid bookings are not counted.
          {pnl.property ? " Costs recorded for the whole group are not included in one property's figures." : ""}
        </Text>
      </LetterheadPage>
    </Document>
  );
}

export async function renderPnlPdf(pnl: PnlForPdf): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<PnlDocument pnl={pnl} />);
}
