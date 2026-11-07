import { Document, Image, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";
import { LetterheadPage, letterheadStyles, pdfColors, TitleRow } from "@/lib/sheet/letterhead-pdf";

import { registrationLayout, type RegistrationForLayout } from "./registration-layout";

/** A guest registration card on the letterhead, as a PDF. Server-only; never public. */

const s = StyleSheet.create({
  sections: { marginTop: 24, gap: 12 },
  section: { borderWidth: 1, borderColor: pdfColors.hairline, borderRadius: 8 },
  sectionHead: { backgroundColor: pdfColors.forest, color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.8, textTransform: "uppercase", paddingVertical: 7, paddingHorizontal: 12, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingVertical: 6 },
  cell: { width: "33.33%", paddingVertical: 4, paddingRight: 10 },
  key: { fontSize: 7.5, color: pdfColors.muted, letterSpacing: 0.6 },
  value: { fontSize: 10, fontWeight: 500, marginTop: 2 },
  conditions: { marginTop: 14, padding: 12, backgroundColor: "#F6F4EE", borderRadius: 8, fontSize: 8.5, lineHeight: 1.5, color: pdfColors.soft },
  signRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, gap: 24 },
  signBox: { flex: 1 },
  signature: { height: 52, objectFit: "contain", alignSelf: "flex-start" },
  signLine: { borderTopWidth: 1, borderTopColor: "#8A948F", paddingTop: 4, marginTop: 4, fontSize: 9 },
});

function RegistrationDocument({ card }: { card: RegistrationForLayout }) {
  const layout = registrationLayout(card);
  return (
    <Document title={`${card.property.name} registration ${layout.number}`} author={card.property.name} creator="Forest Creek">
      <LetterheadPage from={layout.from}>
        <TitleRow title="REGISTRATION" numberLabel="Card no." number={layout.number} />
        <View style={s.sections}>
          {layout.sections.map((section) => (
            <View key={section.title} style={s.section} wrap={false}>
              <Text style={s.sectionHead}>{section.title}</Text>
              <View style={s.grid}>
                {section.rows.map(([key, value]) => (
                  <View key={key} style={s.cell}>
                    <Text style={s.key}>{key}</Text>
                    <Text style={s.value}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
        <View wrap={false}>
          <Text style={s.conditions}>
            <Text style={{ fontWeight: 600, color: pdfColors.ink }}>I agree to the following conditions: </Text>
            {layout.conditions}
          </Text>
          <View style={s.signRow}>
            <View style={s.signBox}>
              {layout.signature ? <Image src={layout.signature} style={s.signature} /> : <View style={{ height: 52 }} />}
              <Text style={s.signLine}>Signature of guest · {layout.signedOn}</Text>
            </View>
            <View style={s.signBox}>
              <Text style={[letterheadStyles.label, { marginBottom: 6 }]}>Receptionist</Text>
              <Text style={s.signLine}>{layout.receptionist}</Text>
            </View>
          </View>
        </View>
      </LetterheadPage>
    </Document>
  );
}

export async function renderRegistrationPdf(card: RegistrationForLayout): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<RegistrationDocument card={card} />);
}
