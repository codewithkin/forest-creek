import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { brandLogo, day, money, registerFonts, styles } from "@/lib/receipt/receipt-document";

/**
 * A quotation as a branded PDF, in the receipt's own layout. Server-only:
 * rendered by the /quote/[id]/pdf route from what the guest's link shows.
 */

export type QuoteData = {
  label: string;
  status: string;
  guestName: string;
  company: string | null;
  validUntil: string;
  issuedAt: string;
  notes: string | null;
  subtotal: number;
  discount: number;
  discountNote: string | null;
  total: number;
  lines: {
    id: string;
    kind: string;
    description: string;
    checkIn: string | null;
    checkOut: string | null;
    guests: number | null;
    unitPrice: number;
    quantity: number;
    amount: number;
  }[];
  property: { name: string; location: string; phone: string; email: string };
};

const USD = "USD";

function QuoteDocument({ quote }: { quote: QuoteData }) {
  const { property } = quote;
  return (
    <Document title={`Forest Creek quotation ${quote.label}`} author={property.name} subject={`Quotation for ${quote.guestName}`} creator="Forest Creek">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={brandLogo()} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.eyebrow}>Quotation</Text>
            <Text style={styles.title}>{quote.label}</Text>
            <Text style={styles.headerMeta}>Issued {day(quote.issuedAt)}</Text>
          </View>
        </View>
        <View style={styles.goldRule} />

        <View style={styles.body}>
          <View style={styles.columns}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Prepared for</Text>
              <Text style={styles.strong}>{quote.guestName}</Text>
              {quote.company && <Text style={styles.line}>{quote.company}</Text>}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>From</Text>
              <Text style={styles.strong}>{property.name}</Text>
              <Text style={styles.line}>{property.location}</Text>
              <Text style={styles.mutedLine}>Valid until {day(quote.validUntil)}</Text>
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colDesc]}>Description</Text>
              <Text style={[styles.th, styles.colMethod]}>Quantity</Text>
              <Text style={[styles.th, styles.colAmount]}>Amount</Text>
            </View>
            {quote.lines.map((line) => (
              <View key={line.id} style={styles.tr} wrap={false}>
                <View style={styles.colDesc}>
                  <Text style={{ fontWeight: 500 }}>{line.description}</Text>
                  {line.checkIn && line.checkOut && (
                    <Text style={[styles.mutedLine, { fontSize: 8.5 }]}>
                      {day(line.checkIn)} – {day(line.checkOut)}
                      {line.guests ? ` · ${line.guests} ${line.guests === 1 ? "guest" : "guests"}` : ""}
                    </Text>
                  )}
                </View>
                <Text style={styles.colMethod}>
                  {line.quantity} × {money(line.unitPrice, USD)}
                  {line.kind === "room" ? " a night" : ""}
                </Text>
                <Text style={[styles.colAmount, { fontWeight: 600 }]}>{money(line.amount, USD)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totals}>
            {quote.discount > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={{ color: "#5E6D67" }}>Subtotal</Text>
                  <Text>{money(quote.subtotal, USD)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={{ color: "#5E6D67" }}>{quote.discountNote || "Discount"}</Text>
                  <Text>-{money(quote.discount, USD)}</Text>
                </View>
              </>
            )}
            <View style={styles.balanceBox}>
              <Text style={{ color: "#FFFFFF", fontWeight: 600 }}>Total</Text>
              <Text style={{ color: "#F8D272", fontFamily: "Cormorant", fontSize: 20, fontWeight: 600 }}>{money(quote.total, USD)}</Text>
            </View>
          </View>

          {quote.notes && <Text style={styles.note}>{quote.notes}</Text>}
          <Text style={styles.note}>
            Accepting this quotation makes your booking at these prices. Your stay is confirmed when your payment is
            received.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerBrand}>{property.name}</Text>
          <Text style={styles.footerText}>
            {property.phone} · {property.email}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(quote: QuoteData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<QuoteDocument quote={quote} />);
}
