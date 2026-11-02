import { Document, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";

import type { DocumentSheet } from "./document-sheet";
import { LetterheadPage, letterheadStyles, pdfColors, TitleRow } from "./letterhead-pdf";

/**
 * A document sheet as a PDF: a clean invoice-style page in Forest Creek's
 * colours, drawn from the same DocumentSheet as the screen. Server-only.
 */

const { forest, gold, clay, soft, muted, hairline } = pdfColors;

const s = StyleSheet.create({
  parties: { flexDirection: "row", justifyContent: "space-between", marginTop: 34 },
  party: { fontSize: 13, fontWeight: 500, marginTop: 6 },
  partySub: { fontSize: 9, color: soft, marginTop: 3 },
  table: { marginTop: 30 },
  head: { flexDirection: "row", backgroundColor: forest, paddingVertical: 11, paddingHorizontal: 16 },
  th: { color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.8, textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: hairline },
  cItem: { flex: 3.4 },
  cQty: { flex: 1.1, textAlign: "center" },
  cPrice: { flex: 1.1, textAlign: "right" },
  cAmount: { flex: 1.2, textAlign: "right" },
  itemTitle: { fontSize: 11.5, fontWeight: 600 },
  detail: { flexDirection: "row", marginTop: 5 },
  detailKey: { width: 70, color: muted, fontSize: 9 },
  detailValue: { fontSize: 9, fontWeight: 500 },
  cell: { fontSize: 10, fontWeight: 500 },
  adjust: { flexDirection: "row", justifyContent: "flex-end", gap: 40, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: hairline },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 36,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: hairline,
  },
  totalLabel: { fontSize: 9, fontWeight: 600, letterSpacing: 2.4, textTransform: "uppercase" },
  total: { fontFamily: "Cormorant", fontSize: 28, fontWeight: 600, color: gold },
  after: { flexDirection: "row", justifyContent: "flex-end", gap: 40, paddingHorizontal: 16, paddingVertical: 5 },
  info: { flexDirection: "row", marginTop: 30, gap: 30 },
  infoCol: { flex: 1 },
  infoText: { fontSize: 9.5, marginTop: 3, lineHeight: 1.5 },
  closing: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 30, gap: 30 },
  note: { flexDirection: "row", alignItems: "baseline", gap: 14, flex: 1 },
  noteText: { fontSize: 10, flex: 1, lineHeight: 1.5 },
  signature: { width: 170, alignItems: "flex-end" },
  signatureLine: { marginTop: 6, borderTopWidth: 1, borderTopColor: "#8A948F", paddingTop: 4, width: 170, textAlign: "right", fontWeight: 500 },
  stamp: { position: "absolute", top: 330, left: 160, transform: "rotate(-12deg)", borderWidth: 4, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 4, fontFamily: "Cormorant", fontSize: 64, fontWeight: 600, letterSpacing: 6, opacity: 0.18 },
});

function SheetDocument({ sheet, documentTitle, author }: { sheet: DocumentSheet; documentTitle: string; author: string }) {
  return (
    <Document title={documentTitle} author={author} creator="Forest Creek">
      <LetterheadPage
        from={sheet.from}
        footerLine={sheet.footerLine}
        footerName={sheet.footerName}
        overlay={
          sheet.stamp ? (
            <Text style={[s.stamp, { color: sheet.stamp === "VOID" ? clay : "#2BA98A", borderColor: sheet.stamp === "VOID" ? clay : "#2BA98A" }]}>{sheet.stamp}</Text>
          ) : undefined
        }
      >
        <TitleRow title={sheet.title} numberLabel={sheet.numberLabel} number={sheet.number} />

        <View style={s.parties}>
          <View>
            <Text style={letterheadStyles.label}>{sheet.partyLabel}</Text>
            <Text style={s.party}>{sheet.party}</Text>
            {sheet.partyLine && <Text style={s.partySub}>{sheet.partyLine}</Text>}
          </View>
          <View>
            <Text style={[letterheadStyles.label, { textAlign: "right" }]}>{sheet.dateLabel}</Text>
            <Text style={[s.party, { textAlign: "right" }]}>{sheet.date}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.head}>
            <Text style={[s.th, s.cItem]}>Item</Text>
            <Text style={[s.th, s.cQty]}>Qty</Text>
            <Text style={[s.th, s.cPrice]}>Price</Text>
            <Text style={[s.th, s.cAmount]}>Amount</Text>
          </View>
          {sheet.items.map((item) => (
            <View key={item.id} style={s.row} wrap={false}>
              <View style={s.cItem}>
                <Text style={s.itemTitle}>{item.title}</Text>
                {item.details.map(([key, value]) => (
                  <View key={`${key}${value}`} style={s.detail}>
                    {key ? <Text style={s.detailKey}>{key}</Text> : null}
                    <Text style={key ? s.detailValue : [s.detailValue, { color: soft, fontWeight: 400 }]}>{value}</Text>
                  </View>
                ))}
              </View>
              <Text style={[s.cell, s.cQty]}>{item.qty}</Text>
              <Text style={[s.cell, s.cPrice]}>{item.price}</Text>
              <Text style={[s.cell, s.cAmount]}>{item.amount}</Text>
            </View>
          ))}
          {sheet.adjustments.map((row) => (
            <View key={row.label} style={s.adjust}>
              <Text style={{ color: soft }}>{row.label}</Text>
              <Text style={{ fontWeight: 500 }}>{row.amount}</Text>
            </View>
          ))}
          <View style={s.totalRow} wrap={false}>
            <Text style={s.totalLabel}>{sheet.totalLabel}</Text>
            <Text style={s.total}>{sheet.total}</Text>
          </View>
          {sheet.after.map((row) => (
            <View key={row.label} style={s.after}>
              <Text style={{ color: soft }}>{row.label}</Text>
              <Text style={{ fontWeight: 600 }}>{row.amount}</Text>
            </View>
          ))}
        </View>

        <View style={s.info} wrap={false}>
          {sheet.info.map((block) => (
            <View key={block.label} style={s.infoCol}>
              <Text style={letterheadStyles.label}>{block.label}</Text>
              {block.lines.map((line, index) => (
                <Text key={line} style={[s.infoText, index === 0 ? { marginTop: 7 } : {}, block.lines.length > 1 && index === 0 ? { fontWeight: 600 } : {}]}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={s.closing} wrap={false}>
          <View style={s.note}>
            <Text style={letterheadStyles.label}>Note</Text>
            <Text style={s.noteText}>{sheet.note}</Text>
          </View>
          {sheet.preparedBy && (
            <View style={s.signature}>
              <Text style={letterheadStyles.label}>Prepared by</Text>
              <Text style={s.signatureLine}>{sheet.preparedBy}</Text>
            </View>
          )}
        </View>
      </LetterheadPage>
    </Document>
  );
}

export async function renderSheetPdf(sheet: DocumentSheet, meta: { title: string; author: string }): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<SheetDocument sheet={sheet} documentTitle={meta.title} author={meta.author} />);
}
