import { Document, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { registerFonts } from "@/lib/receipt/receipt-document";
import { fromProperty } from "@/lib/sheet/document-sheet";
import { LetterheadPage, letterheadStyles, pdfColors } from "@/lib/sheet/letterhead-pdf";
import { formatMenuPrice } from "@/lib/menu-format";

/**
 * The printable menu: the lodge's letterhead, then Food and Bar, each section
 * a heading and its items with prices on dotted leaders. Server-only. What it
 * shows is exactly what /menu shows (the public menu query).
 */

export type PrintableMenu = {
  property: { name: string; location: string; phone: string; email: string; breakfastIncluded: boolean };
  sections: {
    id: string;
    name: string;
    kind: string;
    note: string | null;
    items: { id: string; name: string; description: string | null; priceCents: number | null; tags: string[]; available: boolean }[];
  }[];
};

const { gold, clay, soft, muted, hairline } = pdfColors;

const s = StyleSheet.create({
  title: { fontFamily: "Cormorant", fontSize: 40, fontWeight: 600, letterSpacing: 1, lineHeight: 1, marginTop: 4 },
  underline: { width: 46, height: 3.5, backgroundColor: clay, marginTop: 12 },
  sub: { fontSize: 9, color: soft, marginTop: 10 },
  breakfast: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: gold, borderRadius: 6, fontSize: 9, color: clay },
  part: { fontFamily: "Cormorant", fontSize: 24, fontWeight: 600, marginTop: 24, color: clay, letterSpacing: 2, textTransform: "uppercase" },
  columns: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  section: { marginTop: 14, width: "47%" },
  sectionName: { fontFamily: "Cormorant", fontSize: 17, fontWeight: 600 },
  note: { fontSize: 7.5, color: muted, letterSpacing: 1.4, textTransform: "uppercase", marginTop: 2 },
  rule: { height: 1, backgroundColor: hairline, marginTop: 6, marginBottom: 4 },
  item: { marginTop: 7 },
  line: { flexDirection: "row", alignItems: "flex-end" },
  name: { fontSize: 9.5, fontWeight: 600, maxWidth: "78%" },
  leader: { flex: 1, borderBottomWidth: 0.8, borderBottomColor: "#C9D1CD", borderStyle: "dotted", marginHorizontal: 6, marginBottom: 3 },
  price: { fontSize: 9.5, fontWeight: 600 },
  description: { fontSize: 8, color: soft, marginTop: 2, lineHeight: 1.35 },
  tags: { fontSize: 7.5, color: muted, marginTop: 2 },
  footnote: { fontSize: 7.5, color: muted, marginTop: 22, textAlign: "center" },
});

function Part({ title, sections, newPage = false }: { title: string; sections: PrintableMenu["sections"]; newPage?: boolean }) {
  if (sections.length === 0) return null;
  return (
    // The bar starts its own page, so a heading is never stranded at a page's foot.
    <View break={newPage}>
      <Text style={s.part}>{title}</Text>
      <View style={s.columns}>
      {sections.map((section) => (
        <View key={section.id} style={s.section} wrap={false}>
          <Text style={s.sectionName}>{section.name}</Text>
          {section.note ? <Text style={s.note}>{section.note}</Text> : null}
          <View style={s.rule} />
          {section.items.map((item) => (
            <View key={item.id} style={[s.item, item.available ? {} : { opacity: 0.45 }]}>
              <View style={s.line}>
                <Text style={s.name}>{item.name}</Text>
                <View style={s.leader} />
                <Text style={s.price}>{formatMenuPrice(item.priceCents)}</Text>
              </View>
              {item.description ? <Text style={s.description}>{item.description}</Text> : null}
              {item.tags.length > 0 || !item.available ? (
                <Text style={s.tags}>{[...(item.available ? [] : ["Sold out"]), ...item.tags].join("  ·  ")}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
      </View>
    </View>
  );
}

export async function renderMenuPdf(menu: PrintableMenu): Promise<Buffer> {
  registerFonts();
  const food = menu.sections.filter((section) => section.kind === "food");
  const bar = menu.sections.filter((section) => section.kind === "bar");
  return renderToBuffer(
    <Document title={`Menu — ${menu.property.name}`} author="Forest Creek">
      <LetterheadPage from={fromProperty(menu.property)}>
        <Text style={letterheadStyles.label}>{menu.property.name}</Text>
        <Text style={s.title}>MENU</Text>
        <View style={s.underline} />
        <Text style={s.sub}>Breakfast to a nightcap — prices in US dollars.</Text>
        {menu.property.breakfastIncluded ? (
          <Text style={s.breakfast}>{"Breakfast is included with every night's stay."}</Text>
        ) : null}
        <Part title="Food" sections={food} />
        <Part title="Bar" sections={bar} newPage={food.length > 0} />
        <Text style={s.footnote}>
          All menu items are subject to availability. &quot;Ask&quot; means our team will tell you the price. Please tell us about any allergies when you order.
        </Text>
      </LetterheadPage>
    </Document>,
  );
}
