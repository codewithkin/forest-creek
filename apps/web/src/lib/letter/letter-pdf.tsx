import { Document, Image, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";
import { LetterheadPage, letterheadStyles, pdfColors, StampMark } from "@/lib/sheet/letterhead-pdf";

import { letterLayout, type LetterInputForLayout } from "./letter-layout";

/** A letter on the letterhead, as a PDF. Server-only. */

const s = StyleSheet.create({
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  date: { fontSize: 10.5, fontWeight: 500 },
  recipient: { marginTop: 26 },
  recipientLine: { fontSize: 10.5, lineHeight: 1.45 },
  subject: { marginTop: 24, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 },
  rule: { width: 46, height: 3, backgroundColor: pdfColors.clay, marginTop: 8 },
  paragraph: { marginTop: 14, fontSize: 10.5, lineHeight: 1.6, color: pdfColors.ink },
  closing: { marginTop: 26, fontSize: 11, fontFamily: "Cormorant", fontWeight: 500, color: pdfColors.forest },
  signOff: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  signed: { width: 200 },
  signatureImage: { height: 46, maxWidth: 190, objectFit: "contain", alignSelf: "flex-start", marginTop: 6 },
  signatureSpace: { height: 40 },
  signature: { marginTop: 4, width: 200, borderTopWidth: 0.8, borderTopColor: pdfColors.forest, paddingTop: 5 },
  signerName: { fontFamily: "Cormorant", fontSize: 14, fontWeight: 600, color: pdfColors.forest },
  signerTitle: { fontSize: 7.5, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: pdfColors.gold, marginTop: 2 },
  signerPlace: { fontSize: 8, letterSpacing: 1.4, color: pdfColors.soft, marginTop: 2 },
});

function LetterDocument({ letter }: { letter: LetterInputForLayout }) {
  const layout = letterLayout(letter);
  return (
    <Document title={`${letter.property.name}: ${layout.subject}`} author={letter.property.name} creator="Forest Creek">
      <LetterheadPage from={layout.from}>
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
          <View style={s.signOff}>
            <View style={s.signed}>
              {layout.signature ? <Image src={layout.signature} style={s.signatureImage} /> : <View style={s.signatureSpace} />}
              <View style={s.signature}>
                <Text style={s.signerName}>{layout.signerName}</Text>
                {layout.signerTitle ? <Text style={s.signerTitle}>{layout.signerTitle}</Text> : null}
                <Text style={s.signerPlace}>{layout.propertyName}</Text>
              </View>
            </View>
            {layout.stamped ? <StampMark size={84} /> : null}
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
