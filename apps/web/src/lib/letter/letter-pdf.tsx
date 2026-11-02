import { Document, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";
import { LetterheadPage, letterheadStyles, pdfColors } from "@/lib/sheet/letterhead-pdf";

import { letterLayout, type LetterInputForLayout } from "./letter-layout";

/** A letter on the letterhead, as a PDF. Server-only. */

const s = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 46 },
  date: { fontSize: 10.5, fontWeight: 500 },
  recipient: { marginTop: 26 },
  recipientLine: { fontSize: 10.5, lineHeight: 1.45 },
  subject: { marginTop: 24, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 },
  rule: { width: 46, height: 3, backgroundColor: pdfColors.clay, marginTop: 8 },
  paragraph: { marginTop: 14, fontSize: 10.5, lineHeight: 1.6, color: pdfColors.ink },
  closing: { marginTop: 30, fontSize: 10.5 },
  signature: { marginTop: 34, width: 200, borderTopWidth: 1, borderTopColor: "#8A948F", paddingTop: 5 },
  signerName: { fontSize: 10.5, fontWeight: 600 },
  signerTitle: { fontSize: 9.5, color: pdfColors.soft, marginTop: 2 },
});

function LetterDocument({ letter }: { letter: LetterInputForLayout }) {
  const layout = letterLayout(letter);
  return (
    <Document title={`${letter.property.name}: ${layout.subject}`} author={letter.property.name} creator="Forest Creek">
      <LetterheadPage from={layout.from} footerLine={layout.footerLine} footerName={layout.footerName}>
        <View style={s.meta}>
          <Text style={s.date}>{layout.date}</Text>
          <Text style={[letterheadStyles.label, { marginTop: 3 }]}>Ref {layout.reference}</Text>
        </View>
        <View style={s.recipient}>
          {layout.recipient.map((line) => (
            <Text key={line} style={s.recipientLine}>
              {line}
            </Text>
          ))}
        </View>
        <Text style={s.subject}>RE: {layout.subject.toUpperCase()}</Text>
        <View style={s.rule} />
        {layout.paragraphs.map((paragraph, index) => (
          <Text key={index} style={s.paragraph}>
            {paragraph}
          </Text>
        ))}
        <View wrap={false}>
          <Text style={s.closing}>{layout.closing},</Text>
          <View style={s.signature}>
            <Text style={s.signerName}>{layout.signerName}</Text>
            {layout.signerTitle ? <Text style={s.signerTitle}>{layout.signerTitle}</Text> : null}
            <Text style={s.signerTitle}>{letter.property.name}</Text>
          </View>
        </View>
      </LetterheadPage>
    </Document>
  );
}

export async function renderLetterPdf(letter: LetterInputForLayout): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<LetterDocument letter={letter} />);
}
