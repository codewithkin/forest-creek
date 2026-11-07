import { Circle, Ellipse, G, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { emailLogo } from "@/lib/receipt/receipt-document";

import { BRAND_LINE, footerLines, type SheetFrom } from "./document-sheet";
import {
  art,
  BODY,
  dividerShapes,
  EMBLEM,
  FOOTER_HEIGHT,
  footerShapes,
  headerShapes,
  PAGE,
  type Shape,
  stampLetters,
  stampShapes,
  STAMP_SIZE,
  watermarkShapes,
  WORDMARK,
} from "./letterhead-art";

/**
 * The letterhead every Forest Creek document is printed on, as the lodge
 * supplied it (letterhead-art.ts): the teal band with the emblem and wordmark,
 * the leaf divider, the rosette watermark, and the footer band with the
 * address and contacts, on every page. Quotations, invoices, letters,
 * registration cards and payslips put their own content inside. Server-only.
 */

export const pdfColors = {
  forest: art.teal,
  gold: "#B58D1E",
  clay: "#844F3E",
  ink: "#111A17",
  muted: "#7C8A85",
  soft: "#4D5A55",
  hairline: "#E3E8E5",
} as const;

const { clay, ink, muted } = pdfColors;

export const letterheadStyles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", fontFamily: "Inter", fontSize: 10, color: ink, paddingTop: BODY.top, paddingBottom: BODY.bottom, paddingHorizontal: BODY.side },
  art: { position: "absolute", top: 0, left: 0 },
  emblem: { position: "absolute", left: EMBLEM.cx - EMBLEM.r + 4, top: EMBLEM.cy - EMBLEM.r + 4, width: (EMBLEM.r - 4) * 2, height: (EMBLEM.r - 4) * 2, borderRadius: EMBLEM.r - 4 },
  wordmark: { position: "absolute", left: WORDMARK.left, top: WORDMARK.top, fontFamily: "Cormorant", fontSize: WORDMARK.size, fontWeight: 600, color: art.gold, letterSpacing: 2.6 },
  strap: { position: "absolute", left: WORDMARK.left + 2, top: WORDMARK.strapTop, flexDirection: "row", alignItems: "center", gap: 7 },
  strapRule: { width: 22, height: 0.8, backgroundColor: art.gold },
  strapText: { fontSize: 6.8, letterSpacing: 2.8, color: art.mist, textTransform: "uppercase" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, height: FOOTER_HEIGHT - 10, justifyContent: "center", alignItems: "center", gap: 4 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 7, fontSize: 7.8 },
  diamond: { width: 3.6, height: 3.6, backgroundColor: art.gold, transform: "rotate(45deg)" },
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase", color: muted },
  title: { fontFamily: "Cormorant", fontSize: 44, fontWeight: 600, color: ink, letterSpacing: 1, lineHeight: 1 },
  underline: { width: 46, height: 3.5, backgroundColor: clay, marginTop: 14 },
});

const s = letterheadStyles;

/** One shape from letterhead-art.ts. */
function PdfShape({ shape }: { shape: Shape }) {
  if (shape.kind === "ellipse") {
    return (
      <G transform={`rotate(${shape.rotate} ${shape.cx} ${shape.cy})`}>
        <Ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill="none" stroke={shape.stroke} strokeWidth={shape.width} />
      </G>
    );
  }
  const paint = { fill: shape.fill ?? "none", stroke: shape.stroke, strokeWidth: shape.width, opacity: shape.opacity, strokeDasharray: shape.dash };
  return shape.kind === "path" ? <Path d={shape.d} {...paint} /> : <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
}

const shapes = (list: Shape[]) => list.map((shape, index) => <PdfShape key={index} shape={shape} />);

/** The drawing behind every page: built once, it never changes. */
function PageArt() {
  return (
    <Svg width={PAGE.width} height={PAGE.height} viewBox={`0 0 ${PAGE.width} ${PAGE.height}`} style={s.art}>
      {shapes(watermarkShapes())}
      {shapes(headerShapes())}
      {shapes(dividerShapes())}
      <G transform={`translate(0 ${PAGE.height - FOOTER_HEIGHT})`}>{shapes(footerShapes())}</G>
    </Svg>
  );
}

export function LetterheadPage({
  from,
  overlay,
  children,
}: {
  from: SheetFrom;
  /** Drawn over the page, like a PAID stamp. */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const footer = footerLines(from);
  return (
    <Page size="A4" style={s.page}>
      <View fixed style={s.art}>
        <PageArt />
      </View>
      <Image fixed src={emailLogo()} style={s.emblem} />
      <Text fixed style={s.wordmark}>
        FOREST CREEK
      </Text>
      <View fixed style={s.strap}>
        <View style={s.strapRule} />
        <Text style={s.strapText}>{BRAND_LINE}</Text>
        <View style={s.strapRule} />
      </View>
      {overlay}
      {children}
      <View fixed style={s.footer}>
        <View style={s.footerRow}>
          <Text style={{ color: art.gold }}>{footer.place}</Text>
          {footer.email ? (
            <>
              <View style={s.diamond} />
              <Text style={{ color: "#FFFFFF", fontWeight: 600 }}>{footer.email}</Text>
            </>
          ) : null}
        </View>
        {footer.contacts.length ? (
          <View style={s.footerRow}>
            {footer.contacts.map((contact, index) => (
              <View key={contact} style={s.footerRow}>
                {index > 0 ? <View style={s.diamond} /> : null}
                <Text style={{ color: "#FFFFFF" }}>{contact}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Page>
  );
}

/** The big title with its short underline, and a number on the right. */
export function TitleRow({ title, numberLabel, number, marginTop = 6 }: { title: string; numberLabel: string; number: string; marginTop?: number }) {
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

/** The lodge's round stamp, `size` points across. */
export function StampMark({ size = 86 }: { size?: number }) {
  const letters = stampLetters();
  const glyphs = [...letters.top.map((glyph) => ({ ...glyph, size: 9.5 })), ...letters.bottom.map((glyph) => ({ ...glyph, size: 5.4 }))];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${STAMP_SIZE} ${STAMP_SIZE}`} style={{ opacity: 0.88 }}>
      {shapes(stampShapes())}
      {glyphs.map((glyph, index) => (
        <G key={index} transform={`rotate(${glyph.rotate} ${glyph.x} ${glyph.y})`}>
          <Text x={glyph.x} y={glyph.y + glyph.size * 0.35} fill={art.stamp} textAnchor="middle" style={{ fontFamily: "Inter", fontSize: glyph.size, fontWeight: 600 }}>
            {glyph.character}
          </Text>
        </G>
      ))}
    </Svg>
  );
}
