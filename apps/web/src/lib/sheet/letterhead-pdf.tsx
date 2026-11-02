import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { emailLogo } from "@/lib/receipt/receipt-document";

/**
 * The letterhead every Forest Creek document is printed on: the three colour
 * stripes, the emblem and wordmark, the property's address and contacts, and
 * the footer line. Quotations, invoices, letters and registration cards put
 * their own content inside. Server-only.
 */

export const pdfColors = {
  forest: "#0B2D26",
  gold: "#B58D1E",
  clay: "#844F3E",
  ink: "#111A17",
  muted: "#7C8A85",
  soft: "#4D5A55",
  hairline: "#E3E8E5",
} as const;

const { forest, gold, clay, ink, muted, soft, hairline } = pdfColors;

export const letterheadStyles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", fontFamily: "Inter", fontSize: 10, color: ink, paddingBottom: 64 },
  stripes: { flexDirection: "row", height: 7 },
  body: { paddingHorizontal: 46, paddingTop: 34, flexGrow: 1 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 46, height: 46, borderRadius: 23 },
  wordmark: { fontFamily: "Cormorant", fontSize: 24, fontWeight: 600, color: forest, letterSpacing: 0.6 },
  strapline: { fontSize: 6.5, letterSpacing: 2.2, textTransform: "uppercase", color: soft, marginTop: 1 },
  fromLine: { fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase", color: soft, textAlign: "right", marginBottom: 5 },
  fromContact: { fontSize: 9, fontWeight: 600, textAlign: "right", letterSpacing: 0.4, marginBottom: 2 },
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: muted },
  title: { fontFamily: "Cormorant", fontSize: 50, fontWeight: 600, color: ink, letterSpacing: 1, lineHeight: 1 },
  underline: { width: 46, height: 3.5, backgroundColor: clay, marginTop: 20 },
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

const s = letterheadStyles;

export function LetterheadPage({
  from,
  footerLine,
  footerName,
  overlay,
  children,
}: {
  from: { lines: string[]; phone: string; email?: string };
  footerLine: string;
  footerName: string;
  /** Drawn over the page, like a PAID stamp. */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.stripes} fixed>
        <View style={{ flex: 62, backgroundColor: forest }} />
        <View style={{ flex: 25, backgroundColor: gold }} />
        <View style={{ flex: 13, backgroundColor: clay }} />
      </View>
      {overlay}
      <View style={s.body}>
        <View style={s.top}>
          <View style={s.brand}>
            <Image src={emailLogo()} style={s.logo} />
            <View>
              <Text style={s.wordmark}>
                FOREST <Text style={{ color: gold }}>CREEK</Text>
              </Text>
              <Text style={s.strapline}>{footerLine}</Text>
            </View>
          </View>
          <View>
            {from.lines.map((line) => (
              <Text key={line} style={s.fromLine}>
                {line}
              </Text>
            ))}
            <Text style={s.fromContact}>{from.phone}</Text>
            {from.email ? <Text style={[s.fromContact, { fontWeight: 400, color: soft }]}>{from.email}</Text> : null}
          </View>
        </View>
        {children}
      </View>
      <View style={s.footer} fixed>
        <Text style={s.footerLine}>{footerLine}</Text>
        <Text style={s.footerName}>{footerName}</Text>
      </View>
    </Page>
  );
}

/** The big title with its short underline, and a number on the right. */
export function TitleRow({ title, numberLabel, number, marginTop = 46 }: { title: string; numberLabel: string; number: string; marginTop?: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop }}>
      <View>
        <Text style={s.title}>{title}</Text>
        <View style={s.underline} />
      </View>
      <View>
        <Text style={[s.label, { textAlign: "right" }]}>{numberLabel}</Text>
        <Text style={{ fontSize: 15, fontWeight: 600, marginTop: 5, textAlign: "right", letterSpacing: 0.4 }}>{number}</Text>
      </View>
    </View>
  );
}
