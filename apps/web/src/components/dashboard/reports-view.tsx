"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, BedDouble, CalendarCheck, ChevronLeft, ChevronRight, Download, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";

import { todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { money, percent } from "./kpi";
import { useProperties } from "./property-context";
import { BarList } from "./ui/charts";
import { DataTable, type Column } from "./ui/data-table";
import { FilterPills, PageHeader, Panel, StatTile, type Change } from "./ui/page";
import { ReportWizard } from "./report-wizard";

const periods = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
] as const;

type Period = (typeof periods)[number]["key"];

const DAY = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The date stepper: mirrors stepPeriod in packages/db, on the range the server returned. */
function step(range: { from: string; to: string }, by: 1 | -1): string {
  return by === 1 ? range.to : shift(range.from, -1);
}

function changeOf(current: number, previous: number): Change | null {
  if (previous === 0) return null;
  const percentChange = ((current - previous) / previous) * 100;
  if (Math.abs(percentChange) < 0.5) return { label: "flat", direction: "flat" };
  return { label: `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(0)}%`, direction: percentChange > 0 ? "up" : "down" };
}

function pointsChange(current: number, previous: number): Change {
  const points = (current - previous) * 100;
  if (Math.abs(points) < 0.05) return { label: "flat", direction: "flat" };
  return { label: `${points > 0 ? "+" : ""}${points.toFixed(1)}pts`, direction: points > 0 ? "up" : "down" };
}

type Stay = {
  id: string;
  reference: string;
  guestName: string;
  roomName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: number;
  amountPaid: number;
};

function shortDay(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

const stayColumns: Column<Stay>[] = [
  {
    key: "guest",
    header: "Guest",
    sortValue: (row) => row.guestName.toLowerCase(),
    render: (row) => (
      <>
        <span className="block">{row.guestName}</span>
        <span className="block font-mono text-xs text-accent">{row.reference}</span>
      </>
    ),
  },
  { key: "room", header: "Room", hideBelow: "sm", render: (row) => <span className="text-muted-foreground">{row.roomName}</span> },
  { key: "dates", header: "Dates", sortValue: (row) => row.checkIn, render: (row) => <span className="whitespace-nowrap">{shortDay(row.checkIn)} – {shortDay(row.checkOut)}</span> },
  { key: "total", header: "Total", align: "right", hideBelow: "md", sortValue: (row) => row.totalAmount, render: (row) => money(row.totalAmount) },
];

export default function ReportsView({ initialPeriod, initialDate }: { initialPeriod?: Period; initialDate?: string }) {
  const { selectedId, selected } = useProperties();
  const [period, setPeriod] = useState<Period>(initialPeriod ?? "week");
  const [date, setDate] = useState(initialDate ?? todayIso());

  const report = useQuery(trpc.reports.get.queryOptions({ period, date, propertyId: selectedId }));
  const data = report.data;
  const [exporting, setExporting] = useState(false);

  const atLatest = Boolean(data && data.range.to > todayIso());

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle={selected?.name ?? "All properties"}
        actions={
          <button type="button" onClick={() => setExporting(true)} className={buttonClass({ shape: "pill" })}>
            <Download aria-hidden />
            Get report
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills label="Report period" options={periods} value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous period"
            disabled={!data}
            onClick={() => data && setDate(step(data.range, -1))}
            className="rounded-full border border-border p-2 hover:border-accent/50 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[11rem] text-center text-sm">{data?.label ?? "…"}</span>
          <button
            type="button"
            aria-label="Next period"
            disabled={!data || atLatest}
            onClick={() => data && setDate(step(data.range, 1))}
            className="rounded-full border border-border p-2 hover:border-accent/50 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {report.isError ? (
        <ErrorMessage title="This report didn't load" error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile tone="gold" icon={Wallet} label="Money received" value={money(data?.current.moneyReceived ?? 0)} change={data && changeOf(data.current.moneyReceived, data.previous.moneyReceived)} loading={report.isPending} />
            <StatTile tone="clay" icon={TrendingUp} label="Revenue earned" value={money(data?.current.revenueEarned ?? 0)} change={data && changeOf(data.current.revenueEarned, data.previous.revenueEarned)} loading={report.isPending} />
            <StatTile tone="moss" icon={BedDouble} label="Occupancy" value={percent(data?.current.occupancy ?? 0, 1)} change={data && pointsChange(data.current.occupancy, data.previous.occupancy)} hint={data ? `${data.current.roomNightsSold}/${data.current.roomNightsAvailable} nights` : undefined} loading={report.isPending} />
            <StatTile tone="sage" icon={CalendarCheck} label="Bookings made" value={data?.current.bookingsMade ?? 0} hint={data ? `worth ${money(data.current.bookingsValue)}` : undefined} loading={report.isPending} />
            <StatTile label="Average rate" value={money(data?.current.adr ?? 0)} change={data && changeOf(data.current.adr, data.previous.adr)} hint="per night sold" loading={report.isPending} />
            <StatTile label="RevPAR" value={money(data?.current.revpar ?? 0)} change={data && changeOf(data.current.revpar, data.previous.revpar)} hint="per available room" loading={report.isPending} />
            <StatTile icon={ArrowDownLeft} label="Refunds paid" value={money(data?.current.refundsPaid ?? 0)} hint={data ? `${data.current.cancellations} cancelled` : undefined} loading={report.isPending} />
            <StatTile label="Unpaid bookings" value={data?.current.maybesMade ?? 0} hint={data ? `${money(data.current.maybesValue)}, not income` : undefined} loading={report.isPending} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Money received by method">
              <BarList items={(data?.current.byMethod ?? []).map((row) => ({ key: row.method, label: row.method, value: row.amount }))} format={money} />
            </Panel>
            <Panel title="By property">
              {(data?.properties.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No properties in view.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-normal">Property</th>
                        <th className="pb-2 text-right font-normal">Occ.</th>
                        <th className="pb-2 text-right font-normal">ADR</th>
                        <th className="pb-2 text-right font-normal">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.properties.map((row) => (
                        <tr key={row.propertyId} className="border-t border-border/40">
                          <td className="py-2">{row.propertyName}</td>
                          <td className="py-2 text-right">{percent(row.occupancy, 1)}</td>
                          <td className="py-2 text-right">{money(row.adr)}</td>
                          <td className="py-2 text-right">{money(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section>
              <h2 className="mb-3 font-display text-xl">Arrivals</h2>
              <DataTable columns={stayColumns} rows={data?.arrivals as Stay[] | undefined} rowKey={(row) => row.id} loading={report.isPending} pageSize={10} empty={<StateMessage title="No arrivals in this period" />} />
            </section>
            <section>
              <h2 className="mb-3 font-display text-xl">Departures</h2>
              <DataTable columns={stayColumns} rows={data?.departures as Stay[] | undefined} rowKey={(row) => row.id} loading={report.isPending} pageSize={10} empty={<StateMessage title="No departures in this period" />} />
            </section>
          </div>

          <p className="text-xs text-muted-foreground">
            Money received is what came in during this period, whenever the stay is. Revenue earned is the nights in this
            period, whenever they were paid for. Unpaid bookings are in neither.
          </p>

        </>
      )}

      {exporting && <ReportWizard propertyId={selectedId} initialPeriod={period} initialDate={date} onClose={() => setExporting(false)} />}
    </div>
  );
}
