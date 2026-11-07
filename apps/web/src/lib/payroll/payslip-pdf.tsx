import { Document, Image, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";
import { LetterheadPage, letterheadStyles, pdfColors, TitleRow } from "@/lib/sheet/letterhead-pdf";

import { payslipLayout, type PayslipForLayout } from "./payslip-layout";

/** A payslip on the letterhead, as a PDF. Server-only; owner only. */

const s = StyleSheet.create({
  period: { marginTop: 22, fontSize: 13, fontWeight: 600 },
  box: { marginTop: 18, borderWidth: 1, borderColor: pdfColors.hairline, borderRadius: 8 },
  head: { backgroundColor: pdfColors.forest, color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.8, textTransform: "uppercase", paddingVertical: 7, paddingHorizontal: 12, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingVertical: 6 },
  cell: { width: "50%", paddingVertical: 4, paddingRight: 10 },
  key: { fontSize: 7.5, color: pdfColors.muted, letterSpacing: 0.6 },
  value: { fontSize: 10, fontWeight: 500, marginTop: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: pdfColors.hairline },
  net: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 30, marginTop: 14, paddingHorizontal: 12 },
  netLabel: { fontSize: 9, fontWeight: 600, letterSpacing: 2.4, textTransform: "uppercase" },
  netValue: { fontFamily: "Cormorant", fontSize: 28, fontWeight: 600, color: pdfColors.gold },
  paid: { marginTop: 6, textAlign: "right", fontSize: 9.5, color: pdfColors.soft, paddingHorizontal: 12 },
  signRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 28, gap: 24 },
  signBox: { flex: 1 },
  signature: { height: 52, objectFit: "contain", alignSelf: "flex-start" },
  signLine: { borderTopWidth: 1, borderTopColor: "#8A948F", paddingTop: 4, marginTop: 4, fontSize: 9 },
});

function PayslipDocument({ slip }: { slip: PayslipForLayout }) {
  const layout = payslipLayout(slip);
  return (
    <Document title={`Payslip ${slip.employeeName} ${layout.period}`} author="Forest Creek" creator="Forest Creek">
      <LetterheadPage from={layout.from}>
        <TitleRow title="PAYSLIP" numberLabel="Pay run" number={layout.number} />
        <Text style={s.period}>{layout.period}</Text>
        <View style={s.box} wrap={false}>
          <Text style={s.head}>Employee</Text>
          <View style={s.grid}>
            {layout.employee.map(([key, value]) => (
              <View key={key} style={s.cell}>
                <Text style={s.key}>{key}</Text>
                <Text style={s.value}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.box} wrap={false}>
          <Text style={s.head}>Pay</Text>
          {layout.earnings.map(([key, value]) => (
            <View key={key} style={s.line}>
              <Text>{key}</Text>
              <Text style={{ fontWeight: 500 }}>{value}</Text>
            </View>
          ))}
          <View style={s.line}>
            <Text style={{ color: pdfColors.soft }}>Gross</Text>
            <Text style={{ fontWeight: 600 }}>{layout.gross}</Text>
          </View>
          {layout.deductions.map(([key, value]) => (
            <View key={key} style={s.line}>
              <Text style={{ color: pdfColors.soft }}>{key}</Text>
              <Text style={{ fontWeight: 500 }}>{value}</Text>
            </View>
          ))}
          <View style={s.net}>
            <Text style={s.netLabel}>Net pay (USD)</Text>
            <Text style={s.netValue}>{layout.net}</Text>
          </View>
          <Text style={[s.paid, { marginBottom: 10 }]}>{layout.paid}</Text>
        </View>
        <View style={s.signRow} wrap={false}>
          <View style={s.signBox}>
            {layout.signature ? <Image src={layout.signature} style={s.signature} /> : <View style={{ height: 52 }} />}
            <Text style={s.signLine}>Received by {slip.employeeName}{layout.signedOn ? ` · ${layout.signedOn}` : ""}</Text>
          </View>
          <View style={s.signBox}>
            <Text style={[letterheadStyles.label, { marginBottom: 6 }]}>Paid by</Text>
            <Text style={s.signLine}>{layout.paidBy ?? "—"}</Text>
          </View>
        </View>
      </LetterheadPage>
    </Document>
  );
}

export async function renderPayslipPdf(slip: PayslipForLayout): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<PayslipDocument slip={slip} />);
}
