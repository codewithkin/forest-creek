"use client";

import { useQuery } from "@tanstack/react-query";
import { BedDouble, CalendarClock, Clock, Lightbulb, Moon, TrendingUp, Trophy, Wallet } from "lucide-react";
import { useState } from "react";

import { ErrorMessage, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { channelName } from "./booking-labels";
import { money, percent } from "./kpi";
import { useProperties } from "./property-context";
import { AreaChart, BarList, Donut, Sparkline } from "./ui/charts";
import { FilterPills, PageHeader, Panel, StatTile, type Change } from "./ui/page";

const ranges = [
  { key: "3", label: "3 months" },
  { key: "6", label: "6 months" },
  { key: "12", label: "12 months" },
  { key: "24", label: "24 months" },
] as const;

type RangeKey = (typeof ranges)[number]["key"];

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", year: "2-digit" });
}

function changeOf(current: number, previous: number): Change | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return { label: "flat", direction: "flat" };
  return { label: `${change > 0 ? "+" : ""}${change.toFixed(0)}%`, direction: change > 0 ? "up" : "down" };
}

function pointsChange(current: number, previous: number): Change | null {
  if (previous === 0) return null;
  const points = (current - previous) * 100;
  if (Math.abs(points) < 0.05) return { label: "flat", direction: "flat" };
  return { label: `${points > 0 ? "+" : ""}${points.toFixed(1)}pts`, direction: points > 0 ? "up" : "down" };
}

export default function TrendsView() {
  const { selectedId, selected } = useProperties();
  const [range, setRange] = useState<RangeKey>("12");
  const trends = useQuery(trpc.trends.get.queryOptions({ months: Number(range) as 3 | 6 | 12 | 24, propertyId: selectedId }));
  const data = trends.data;

  if (trends.isError) return <ErrorMessage title="Trends didn't load" error={trends.error} onRetry={() => void trends.refetch()} />;

  const best = data?.properties[0];
  const showBest = (data?.properties.length ?? 0) > 1 && (best?.roomRevenue ?? 0) > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trends"
        subtitle={`${selected?.name ?? "All properties"}, from paid stays only`}
        actions={<FilterPills label="How far back" options={ranges} value={range} onChange={setRange} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          tone="gold"
          icon={Wallet}
          label="Room revenue"
          value={money(data?.current.roomRevenue ?? 0)}
          change={data && changeOf(data.current.roomRevenue, data.previous.roomRevenue)}
          chart={data && <Sparkline values={data.monthly.map((month) => month.roomRevenue)} label="Room revenue by month" />}
          loading={trends.isPending}
        />
        <StatTile
          tone="moss"
          icon={BedDouble}
          label="Occupancy"
          value={percent(data?.current.occupancy ?? 0, 1)}
          change={data && pointsChange(data.current.occupancy, data.previous.occupancy)}
          chart={data && <Sparkline values={data.monthly.map((month) => month.occupancy)} label="Occupancy by month" />}
          loading={trends.isPending}
        />
        <StatTile tone="clay" icon={TrendingUp} label="Average rate" value={money(data?.current.adr ?? 0)} change={data && changeOf(data.current.adr, data.previous.adr)} hint="per night sold" loading={trends.isPending} />
        <StatTile tone="sage" label="RevPAR" value={money(data?.current.revpar ?? 0)} change={data && changeOf(data.current.revpar, data.previous.revpar)} hint="per available room" loading={trends.isPending} />
      </div>

      {trends.isPending ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : (
        <Panel title="What stands out" action={<Lightbulb className="size-5 text-accent" aria-hidden />}>
          {data?.insights.length ? (
            <ul className="space-y-2 text-sm">
              {data.insights.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not enough paid stays in this period to draw conclusions yet.</p>
          )}
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Room revenue">
          {trends.isPending ? (
            <Skeleton className="h-52 w-full rounded-2xl" />
          ) : (
            <AreaChart
              label={`Room revenue by month, ${data?.monthly.length} months`}
              format={money}
              points={(data?.monthly ?? []).map((month) => ({ label: monthLabel(month.month), value: month.roomRevenue }))}
            />
          )}
        </Panel>
        <div className="space-y-4">
          {showBest && best && (
            <section className="rounded-3xl border border-accent/40 bg-accent/10 p-5">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Trophy className="size-4 text-accent" aria-hidden />
                Best performing property
              </p>
              <p className="mt-2 font-display text-2xl">{best.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {money(best.roomRevenue)}, {percent(best.share)} of room revenue, {percent(best.occupancy, 1)} occupancy
              </p>
            </section>
          )}
          <Panel title="On the books">
            <ul className="space-y-3">
              {data?.forwards.map((row) => (
                <li key={row.days}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>Next {row.days} days</span>
                    <span className="text-muted-foreground">
                      {percent(row.occupancy)} · {money(row.roomRevenue)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-secondary">
                    <div className="h-2 rounded-full bg-[#2BA98A]" style={{ width: `${Math.max(1.5, row.occupancy * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="Occupancy">
        {trends.isPending ? (
          <Skeleton className="h-44 w-full rounded-2xl" />
        ) : (
          <AreaChart
            height={180}
            label={`Occupancy by month, ${data?.monthly.length} months`}
            format={(value) => `${value.toFixed(0)}%`}
            points={(data?.monthly ?? []).map((month) => ({ label: monthLabel(month.month), value: month.occupancy * 100 }))}
          />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Properties">
          {(data?.properties.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No properties in view.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-normal">Property</th>
                    <th className="pb-2 text-right font-normal">Revenue</th>
                    <th className="pb-2 text-right font-normal">Occ.</th>
                    <th className="pb-2 text-right font-normal">ADR</th>
                    <th className="pb-2 text-right font-normal">RevPAR</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.properties.map((row) => (
                    <tr key={row.key} className="border-t border-border/40">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-right">{money(row.roomRevenue)}</td>
                      <td className="py-2 text-right">{percent(row.occupancy, 1)}</td>
                      <td className="py-2 text-right">{money(row.adr)}</td>
                      <td className="py-2 text-right">{money(row.revpar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Top rooms">
          <BarList
            format={money}
            items={(data?.rooms ?? []).map((room) => ({ key: room.key, label: room.name, value: room.roomRevenue, hint: percent(room.occupancy) }))}
          />
        </Panel>
        <Panel title="Where bookings come from">
          <Donut format={money} slices={(data?.channels ?? []).map((row) => ({ key: row.channel, label: channelName(row.channel), value: row.value }))} />
        </Panel>
        <Panel title="Busiest nights">
          <BarList format={(value) => `${value} ${value === 1 ? "night" : "nights"}`} items={(data?.weekdays ?? []).map((row) => ({ key: row.day, label: row.day, value: row.nights }))} />
        </Panel>
        <Panel title="Popular experiences">
          <BarList format={(value) => `${value} ${value === 1 ? "stay" : "stays"}`} items={(data?.experiences ?? []).map((row) => ({ key: row.name, label: row.name, value: row.count }))} />
        </Panel>
        <Panel title="Booking habits">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden />
                Booked ahead
              </dt>
              <dd className="mt-1 font-display text-2xl">{Math.round(data?.habits.leadDays ?? 0)} days</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Moon className="size-3.5" aria-hidden />
                Average stay
              </dt>
              <dd className="mt-1 font-display text-2xl">{(data?.habits.stayNights ?? 0).toFixed(1)} nights</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                Bookings confirmed
              </dt>
              <dd className="mt-1 font-display text-2xl">{data?.conversion == null ? "—" : percent(data.conversion)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cancelled</dt>
              <dd className="mt-1 font-display text-2xl">{data?.cancellationRate == null ? "—" : percent(data.cancellationRate)}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
