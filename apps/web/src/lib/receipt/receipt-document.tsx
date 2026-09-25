import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/**
 * Forest Creek's receipt, as a real PDF the guest downloads. Server-only:
 * rendered by the /receipt/[id] route handler from the receipt the API
 * returns, in the site's own fonts and colours.
 */

export type ReceiptData = {
  number: string;
  issuedAt: string;
  amount: number;
  kindLabel: string;
  methodLabel: string;
  source: string;
  paynowReference: string | null;
  paidToDate: number;
  balanceAfter: number;
  currency: string;
  booking: {
    reference: string;
    guestName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    guests: number;
    activityNames: string[];
    totalAmount: number;
    roomRate: number;
    subtotal: number;
    balanceDueDate: string | null;
  };
  property: { name: string; location: string; phone: string; email: string };
};

// The site's palette (packages/ui globals.css), as print colours.
const forest = "#0B2D26"; // --background hsl(168 61% 11%)
const forestSoft = "#123F35";
const gold = "#F8D272"; // --accent hsl(43 90% 71%)
const terracotta = "#844F3E"; // --primary hsl(15 36% 38%)
const ink = "#17231F";
const muted = "#5E6D67";
const hairline = "#DCE3DF";
const paper = "#FBFAF6";

/** public/ is ./public in dev and apps/web/public in the standalone image. */
function publicFile(name: string): string {
  const candidates = [
    path.join(process.cwd(), "public", name),
    path.join(process.cwd(), "apps", "web", "public", name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

let logo: { data: Buffer; format: "png" } | undefined;
/** Read once and handed over as bytes: a Windows path is not a valid image URL. */
function brandLogo() {
  // Not traced: the image copies public/ in whole, and tracing a computed path
  // would pull the entire project into the server bundle.
  logo ??= { data: readFileSync(/*turbopackIgnore: true*/ publicFile("receipt-logo.png")), format: "png" };
  return logo;
}

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Cormorant",
    fonts: [400, 500, 600].map((fontWeight) => ({
      src: publicFile(`fonts/cormorant-garamond-latin-${fontWeight}-normal.woff`),
      fontWeight,
    })),
  });
  Font.register({
    family: "Inter",
    fonts: [400, 500, 600].map((fontWeight) => ({
      src: publicFile(`fonts/inter-latin-${fontWeight}-normal.woff`),
      fontWeight,
    })),
  });
  // Words stay whole: a receipt must never hyphenate a name or a reference.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { backgroundColor: paper, fontFamily: "Inter", fontSize: 9.5, color: ink, paddingBottom: 72 },
  header: {
    backgroundColor: forest,
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { width: 118, borderRadius: 6 },
  headerRight: { alignItems: "flex-end" },
  eyebrow: { color: gold, fontSize: 8, letterSpacing: 2.4, textTransform: "uppercase" },
  title: { color: "#FFFFFF", fontFamily: "Cormorant", fontSize: 34, fontWeight: 500, marginTop: 2 },
  headerMeta: { color: "#C9D6D1", fontSize: 9, marginTop: 4 },
  goldRule: { height: 3, backgroundColor: gold },
  body: { paddingHorizontal: 40, paddingTop: 26 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  paidStamp: {
    alignSelf: "flex-start",
    borderWidth: 1.2,
    borderColor: terracotta,
    color: terracotta,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  amountBig: { fontFamily: "Cormorant", fontSize: 30, fontWeight: 600, color: forest, textAlign: "right" },
  amountCaption: { color: muted, fontSize: 8.5, textAlign: "right" },
  columns: { flexDirection: "row", marginTop: 24, gap: 18 },
  card: { flex: 1, borderWidth: 1, borderColor: hairline, borderRadius: 8, padding: 14, backgroundColor: "#FFFFFF" },
  cardTitle: {
    color: terracotta,
    fontSize: 7.5,
    fontWeight: 600,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  strong: { fontWeight: 600, fontSize: 10.5 },
  line: { marginTop: 3, color: ink },
  mutedLine: { marginTop: 3, color: muted },
  table: { marginTop: 24, borderWidth: 1, borderColor: hairline, borderRadius: 8, overflow: "hidden" },
  tableHead: { flexDirection: "row", backgroundColor: forestSoft, paddingVertical: 8, paddingHorizontal: 14 },
  th: { color: "#E6EEEA", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 11, paddingHorizontal: 14, backgroundColor: "#FFFFFF" },
  colDesc: { flex: 3.2 },
  colMethod: { flex: 1.6 },
  colAmount: { flex: 1, textAlign: "right" },
  totals: { marginTop: 18, marginLeft: "auto", width: 250 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalDivider: { borderTopWidth: 1, borderTopColor: hairline, marginTop: 4, paddingTop: 8 },
  balanceBox: {
    marginTop: 10,
    backgroundColor: forest,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  note: { marginTop: 22, color: muted, fontSize: 8.5, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: forest,
    paddingHorizontal: 40,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: { color: "#C9D6D1", fontSize: 8 },
  footerBrand: { color: gold, fontFamily: "Cormorant", fontSize: 13, fontWeight: 500 },
});

function money(amount: number, currency: string): string {
  const figure = amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === "USD" ? `US$${figure}` : `${currency} ${figure}`;
}

/** Stay dates are UTC midnights: formatted in UTC or they shift a day. */
function day(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function issued(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Harare",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReceiptDocument({ receipt }: { receipt: ReceiptData }) {
  const { booking, property, currency } = receipt;
  const nights = `${booking.nights} ${booking.nights === 1 ? "night" : "nights"}`;
  return (
    <Document
      title={`Forest Creek receipt ${receipt.number}`}
      author={property.name}
      subject={`Payment for booking ${booking.reference}`}
      creator="Forest Creek"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={brandLogo()} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.eyebrow}>Payment receipt</Text>
            <Text style={styles.title}>{receipt.number}</Text>
            <Text style={styles.headerMeta}>Issued {issued(receipt.issuedAt)} (Zimbabwe time)</Text>
          </View>
        </View>
        <View style={styles.goldRule} />

        <View style={styles.body}>
          <View style={styles.row}>
            <View>
              <Text style={styles.paidStamp}>Paid</Text>
              <Text style={[styles.mutedLine, { marginTop: 10 }]}>
                Thank you — we have received your payment.
              </Text>
            </View>
            <View>
              <Text style={styles.amountBig}>{money(receipt.amount, currency)}</Text>
              <Text style={styles.amountCaption}>{receipt.kindLabel}</Text>
            </View>
          </View>

          <View style={styles.columns}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Received from</Text>
              <Text style={styles.strong}>{booking.guestName}</Text>
              <Text style={styles.line}>Booking reference {booking.reference}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your stay</Text>
              <Text style={styles.strong}>{property.name}</Text>
              <Text style={styles.line}>{booking.roomName}</Text>
              <Text style={styles.mutedLine}>
                {day(booking.checkIn)} – {day(booking.checkOut)} · {nights} · {booking.guests}{" "}
                {booking.guests === 1 ? "guest" : "guests"}
              </Text>
              {booking.activityNames.length > 0 && (
                <Text style={styles.mutedLine}>With {booking.activityNames.join(", ")}</Text>
              )}
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colDesc]}>Description</Text>
              <Text style={[styles.th, styles.colMethod]}>Paid by</Text>
              <Text style={[styles.th, styles.colAmount]}>Amount</Text>
            </View>
            <View style={styles.tr}>
              <View style={styles.colDesc}>
                <Text style={{ fontWeight: 500 }}>
                  {receipt.kindLabel} — {booking.roomName}, {nights}
                </Text>
                <Text style={[styles.mutedLine, { fontSize: 8.5 }]}>
                  Booking {booking.reference} at {property.name}
                </Text>
              </View>
              <View style={styles.colMethod}>
                <Text>{receipt.methodLabel}</Text>
                {receipt.paynowReference && (
                  <Text style={[styles.mutedLine, { fontSize: 8 }]}>Paynow ref {receipt.paynowReference}</Text>
                )}
              </View>
              <Text style={[styles.colAmount, { fontWeight: 600 }]}>{money(receipt.amount, currency)}</Text>
            </View>
          </View>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={{ color: muted }}>
                Accommodation ({money(booking.roomRate, currency)} × {nights})
              </Text>
              <Text>{money(booking.subtotal, currency)}</Text>
            </View>
            {booking.totalAmount > booking.subtotal && (
              <View style={styles.totalRow}>
                <Text style={{ color: muted }}>Experiences</Text>
                <Text>{money(booking.totalAmount - booking.subtotal, currency)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalDivider]}>
              <Text style={{ fontWeight: 600 }}>Stay total</Text>
              <Text style={{ fontWeight: 600 }}>{money(booking.totalAmount, currency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={{ color: muted }}>Paid to date</Text>
              <Text>{money(receipt.paidToDate, currency)}</Text>
            </View>
            <View style={styles.balanceBox}>
              <Text style={{ color: "#E6EEEA", fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase" }}>
                {receipt.balanceAfter > 0 ? "Balance remaining" : "Balance"}
              </Text>
              <Text style={{ color: gold, fontFamily: "Cormorant", fontSize: 18, fontWeight: 600 }}>
                {receipt.balanceAfter > 0 ? money(receipt.balanceAfter, currency) : "Nothing due"}
              </Text>
            </View>
            {receipt.balanceAfter > 0 && booking.balanceDueDate && (
              <Text style={[styles.amountCaption, { marginTop: 5 }]}>
                Due by {day(booking.balanceDueDate)}
              </Text>
            )}
          </View>

          <Text style={styles.note}>
            {receipt.source === "paynow"
              ? "Paid securely through Paynow. "
              : "Payment received and recorded by the Forest Creek team. "}
            Please keep this receipt with your booking reference. Our booking and cancellation
            policy applies to this stay. Questions about this payment: {property.phone} ·{" "}
            {property.email}.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <View>
            <Text style={styles.footerBrand}>{property.name}</Text>
            <Text style={styles.footerText}>{property.location}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.footerText}>{property.phone}</Text>
            <Text style={styles.footerText}>{property.email}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(receipt: ReceiptData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReceiptDocument receipt={receipt} />);
}
