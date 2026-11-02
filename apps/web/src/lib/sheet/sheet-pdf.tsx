import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { emailLogo, registerFonts } from "@/lib/receipt/receipt-document";

import type { DocumentSheet } from "./document-sheet";

/**
 * A document sheet as a PDF: a clean invoice-style page in Forest Creek's
 * colours, drawn from the same DocumentSheet as the screen. Server-only.
 */

const forest = "#0B2D26";
const gold = "#B58D1E";
const clay = "#844F3E";
const ink = "#111A17";
const muted = "#7C8A85";
const soft = "#4D5A55";
const hairline = "#E3E8E5";

const s = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", fontFamily: "Inter", fontSize: 10, color: ink, paddingBottom: 64 },
  stripes: { flexDirection: "row", height: 7 },
  body: { paddingHorizontal: 46, paddingTop: 34, flexGrow: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 46, height: 46, borderRadius: 23 },
  wordmark: { fontFamily: "Cormorant", fontSize: 24, fontWeight: 600, color: forest, letterSpacing: 0.6 },
  strapline: { fontSize: 6.5, letterSpacing: 2.2, textTransform: "uppercase", color: soft, marginTop: 1 },
  fromLine: { fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase", color: soft, textAlign: "right", marginBottom: 5 },
  fromPhone: { fontSize: 9, fontWeight: 600, textAlign: "right", letterSpacing: 0.6 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 46 },
  title: { fontFamily: "Cormorant", fontSize: 50, fontWeight: 600, color: ink, letterSpacing: 1, lineHeight: 1 },
  underline: { width: 46, height: 3.5, backgroundColor: clay, marginTop: 20 },
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: muted },
  number: { fontSize: 15, fontWeight: 600, marginTop: 5, textAlign: "right", letterSpacing: 0.4 },
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
  footer: {
    position: "absolute",
    bottom: 26,
    left: 46,
    right: 46,
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerLine: { fontSize: 7.5, fontWeight: 600, letterSpacing: 2.6, textTransform: "uppercase", color: gold },
  footerName: { fontSize: 7.5, color: muted },
});

function SheetDocument({ sheet, documentTitle, author }: { sheet: DocumentSheet; documentTitle: string; author: string }) {
  return (
    <Document title={documentTitle} author={author} creator="Forest Creek">
      <Page size="A4" style={s.page}>
        <View style={s.stripes} fixed>
          <View style={{ flex: 62, backgroundColor: forest }} />
          <View style={{ flex: 25, backgroundColor: gold }} />
          <View style={{ flex: 13, backgroundColor: clay }} />
        </View>

        {sheet.stamp && <Text style={[s.stamp, { color: sheet.stamp === "VOID" ? clay : "#2BA98A", borderColor: sheet.stamp === "VOID" ? clay : "#2BA98A" }]}>{sheet.stamp}</Text>}

        <View style={s.body}>
          <View style={s.top}>
            <View style={s.brand}>
              <Image src={emailLogo()} style={s.logo} />
              <View>
                <Text style={s.wordmark}>
                  FOREST <Text style={{ color: gold }}>CREEK</Text>
                </Text>
                <Text style={s.strapline}>{sheet.footerLine}</Text>
              </View>
            </View>
            <View>
              {sheet.from.lines.map((line) => (
                <Text key={line} style={s.fromLine}>
                  {line}
                </Text>
              ))}
              <Text style={s.fromPhone}>{sheet.from.phone}</Text>
            </View>
          </View>

          <View style={s.titleRow}>
            <View>
              <Text style={s.title}>{sheet.title}</Text>
              <View style={s.underline} />
            </View>
            <View>
              <Text style={[s.label, { textAlign: "right" }]}>{sheet.numberLabel}</Text>
              <Text style={s.number}>{sheet.number}</Text>
            </View>
          </View>

          <View style={s.parties}>
            <View>
              <Text style={s.label}>{sheet.partyLabel}</Text>
              <Text style={s.party}>{sheet.party}</Text>
              {sheet.partyLine && <Text style={s.partySub}>{sheet.partyLine}</Text>}
            </View>
            <View>
              <Text style={[s.label, { textAlign: "right" }]}>{sheet.dateLabel}</Text>
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
                <Text style={s.label}>{block.label}</Text>
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
              <Text style={s.label}>Note</Text>
              <Text style={s.noteText}>{sheet.note}</Text>
            </View>
            {sheet.preparedBy && (
              <View style={s.signature}>
                <Text style={s.label}>Prepared by</Text>
                <Text style={s.signatureLine}>{sheet.preparedBy}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerLine}>{sheet.footerLine}</Text>
          <Text style={s.footerName}>{sheet.footerName}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderSheetPdf(sheet: DocumentSheet, meta: { title: string; author: string }): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<SheetDocument sheet={sheet} documentTitle={meta.title} author={meta.author} />);
}
