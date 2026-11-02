import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { brandLogo, day, money as receiptMoney, registerFonts, styles } from "@/lib/receipt/receipt-document";

/** A report as a branded PDF. Server-only: rendered by the /dashboard/reports/pdf route. */

export type ReportData = {
  period: string;
  label: string;
  current: {
    moneyReceived: number;
    refundsPaid: number;
    revenueEarned: number;
    roomNightsSold: number;
    roomNightsAvailable: number;
    occupancy: number;
    adr: number;
    revpar: number;
    bookingsMade: number;
    bookingsValue: number;
    cancellations: number;
    maybesMade: number;
    maybesValue: number;
    byMethod: { method: string; amount: number }[];
  };
  previous: { moneyReceived: number; revenueEarned: number; occupancy: number };
  properties: { propertyId: string; propertyName: string; occupancy: number; adr: number; revpar: number; revenue: number }[];
  arrivals: { id: string; reference: string; guestName: string; roomName: string; propertyName: string; checkIn: string; checkOut: string; guests: number }[];
  departures: { id: string; reference: string; guestName: string; roomName: string; propertyName: string; checkIn: string; checkOut: string; guests: number }[];
};

const money = (amount: number) => receiptMoney(Math.round(amount), "USD");
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const TITLES: Record<string, string> = { day: "Daily report", week: "Weekly report", month: "Monthly report" };

function Figure({ label, value, was }: { label: string; value: string; was?: string }) {
  return (
    <View style={[styles.card, { minWidth: 110 }]}>
      <Text style={styles.cardTitle}>{label}</Text>
      <Text style={{ fontFamily: "Cormorant", fontSize: 20, fontWeight: 600 }}>{value}</Text>
      {was && <Text style={[styles.mutedLine, { fontSize: 8 }]}>was {was}</Text>}
    </View>
  );
}

function Movements({ title, rows }: { title: string; rows: ReportData["arrivals"] }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.table} wrap>
      <View style={styles.tableHead} fixed>
        <Text style={[styles.th, styles.colDesc]}>{title}</Text>
        <Text style={[styles.th, styles.colMethod]}>Room</Text>
        <Text style={[styles.th, styles.colAmount]}>Dates</Text>
      </View>
      {rows.map((stay) => (
        <View key={stay.id} style={[styles.tr, { paddingVertical: 6 }]} wrap={false}>
          <View style={styles.colDesc}>
            <Text>{stay.guestName}</Text>
            <Text style={[styles.mutedLine, { fontSize: 8 }]}>{stay.reference}</Text>
          </View>
          <Text style={styles.colMethod}>{stay.roomName}</Text>
          <Text style={[styles.colAmount, { fontSize: 8.5 }]}>
            {day(stay.checkIn)} – {day(stay.checkOut)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportDocument({ report }: { report: ReportData }) {
  const { current, previous } = report;
  return (
    <Document title={`Forest Creek ${report.label}`} author="Forest Creek" creator="Forest Creek">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={brandLogo()} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.eyebrow}>{TITLES[report.period] ?? "Report"}</Text>
            <Text style={[styles.title, { fontSize: 26 }]}>{report.label}</Text>
          </View>
        </View>
        <View style={styles.goldRule} />

        <View style={styles.body}>
          <View style={styles.columns}>
            <Figure label="Money received" value={money(current.moneyReceived)} was={money(previous.moneyReceived)} />
            <Figure label="Revenue earned" value={money(current.revenueEarned)} was={money(previous.revenueEarned)} />
            <Figure label="Occupancy" value={percent(current.occupancy)} was={percent(previous.occupancy)} />
          </View>
          <View style={[styles.columns, { marginTop: 12 }]}>
            <Figure label="Average rate" value={money(current.adr)} />
            <Figure label="Bookings made" value={`${current.bookingsMade}, ${money(current.bookingsValue)}`} />
            <Figure label="Cancellations" value={String(current.cancellations)} />
          </View>

          {current.byMethod.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.colDesc]}>Money received by method</Text>
                <Text style={[styles.th, styles.colAmount]}>Amount</Text>
              </View>
              {current.byMethod.map((row) => (
                <View key={row.method} style={[styles.tr, { paddingVertical: 6 }]}>
                  <Text style={styles.colDesc}>{row.method}</Text>
                  <Text style={styles.colAmount}>{money(row.amount)}</Text>
                </View>
              ))}
              {current.refundsPaid > 0 && (
                <View style={[styles.tr, { paddingVertical: 6 }]}>
                  <Text style={styles.colDesc}>Refunds paid</Text>
                  <Text style={styles.colAmount}>-{money(current.refundsPaid)}</Text>
                </View>
              )}
            </View>
          )}

          {report.properties.length > 1 && (
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.colDesc]}>Property</Text>
                <Text style={[styles.th, styles.colMethod]}>Occupancy</Text>
                <Text style={[styles.th, styles.colAmount]}>Revenue</Text>
              </View>
              {report.properties.map((row) => (
                <View key={row.propertyId} style={[styles.tr, { paddingVertical: 6 }]}>
                  <Text style={styles.colDesc}>{row.propertyName}</Text>
                  <Text style={styles.colMethod}>{percent(row.occupancy)}</Text>
                  <Text style={styles.colAmount}>{money(row.revenue)}</Text>
                </View>
              ))}
            </View>
          )}

          <Movements title="Arrivals" rows={report.arrivals} />
          <Movements title="Departures" rows={report.departures} />

          <Text style={styles.note}>
            Money received is what came in during this period, whenever the stay is. Revenue earned is the nights in this
            period, whenever they were paid for. Unpaid bookings ({current.maybesMade}, worth {money(current.maybesValue)})
            are in neither.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerBrand}>Forest Creek</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(report: ReportData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument report={report} />);
}
