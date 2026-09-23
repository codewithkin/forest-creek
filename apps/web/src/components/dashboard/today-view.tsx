"use client";

import { useQuery } from "@tanstack/react-query";
import { BedDouble, LogIn, LogOut, MessageSquare, Users, Wallet } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { ErrorMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { AttentionPanel } from "./attention-panel";
import { KpiCard, money, percent } from "./kpi";
import { useProperties } from "./property-context";
import RevenueChart from "./revenue-chart";

const ranges = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

function isoDaysFrom(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function TodayView() {
  const { selectedId, selected, canSeeAll } = useProperties();
  const [windowDays, setWindowDays] = useState<number>(30);

  const today = new Date().toISOString().slice(0, 10);
  const range = { from: isoDaysFrom(-windowDays), to: isoDaysFrom(1) };

  const ops = useQuery(trpc.analytics.ops.queryOptions({ today, propertyId: selectedId }));
  const kpis = useQuery(trpc.analytics.kpis.queryOptions({ ...range, propertyId: selectedId }));
  const revenue = useQuery(
    trpc.analytics.revenueByDay.queryOptions({ ...range, propertyId: selectedId }),
  );

  // Group totals: rates must be recomputed from the underlying counts, never
  // averaged across properties, or a 2-room site would weigh as much as a 20.
  const rows = kpis.data ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      roomNightsSold: acc.roomNightsSold + row.current.roomNightsSold,
      roomNightsAvailable: acc.roomNightsAvailable + row.current.roomNightsAvailable,
      roomRevenue: acc.roomRevenue + row.current.roomRevenue,
      totalRevenue: acc.totalRevenue + row.current.totalRevenue,
      prevSold: acc.prevSold + row.previous.roomNightsSold,
      prevAvailable: acc.prevAvailable + row.previous.roomNightsAvailable,
      prevRoomRevenue: acc.prevRoomRevenue + row.previous.roomRevenue,
      prevTotalRevenue: acc.prevTotalRevenue + row.previous.totalRevenue,
    }),
    {
      roomNightsSold: 0, roomNightsAvailable: 0, roomRevenue: 0, totalRevenue: 0,
      prevSold: 0, prevAvailable: 0, prevRoomRevenue: 0, prevTotalRevenue: 0,
    },
  );

  const occupancy = totals.roomNightsAvailable ? totals.roomNightsSold / totals.roomNightsAvailable : 0;
  const prevOccupancy = totals.prevAvailable ? totals.prevSold / totals.prevAvailable : 0;
  const adr = totals.roomNightsSold ? totals.roomRevenue / totals.roomNightsSold : 0;
  const prevAdr = totals.prevSold ? totals.prevRoomRevenue / totals.prevSold : 0;
  const revpar = totals.roomNightsAvailable ? totals.roomRevenue / totals.roomNightsAvailable : 0;
  const prevRevpar = totals.prevAvailable ? totals.prevRoomRevenue / totals.prevAvailable : 0;

  const snapshot = ops.data;
  const needsAction =
    (snapshot?.awaitingPaymentCount ?? 0) > 0 || (snapshot?.awaitingReply ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">
          Today at {selected?.name ?? "the group"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </p>
      </div>

      {(ops.isError || kpis.isError || revenue.isError) && (
        <ErrorMessage
          title="Some of today's figures didn't load"
          error={ops.error ?? kpis.error ?? revenue.error}
          onRetry={() => {
            void ops.refetch();
            void kpis.refetch();
            void revenue.refetch();
          }}
        />
      )}

      {/* Things that need a person */}
      {needsAction && (
        <section className="grid gap-3 sm:grid-cols-2">
          {(snapshot?.awaitingPaymentCount ?? 0) > 0 && (
            <ActionCard
              href={"/dashboard/bookings" as Route}
              icon={Wallet}
              title={`${snapshot!.awaitingPaymentCount} payment${snapshot!.awaitingPaymentCount === 1 ? "" : "s"} to verify`}
              detail={`${money(snapshot!.awaitingPaymentValue)} unconfirmed`}
            />
          )}
          {(snapshot?.awaitingReply ?? 0) > 0 && (
            <ActionCard
              href={"/dashboard/chat" as Route}
              icon={MessageSquare}
              title={`${snapshot!.awaitingReply} guest${snapshot!.awaitingReply === 1 ? "" : "s"} waiting on a reply`}
              detail="Last word was theirs"
            />
          )}
        </section>
      )}

      <AttentionPanel propertyId={selectedId} />

      {/* Today's movements */}
      <section>
        <h2 className="font-display text-xl">Movements</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={LogIn} label="Arrivals" value={snapshot?.arrivals ?? 0} loading={ops.isPending} />
          <StatTile icon={LogOut} label="Departures" value={snapshot?.departures ?? 0} loading={ops.isPending} />
          <StatTile icon={BedDouble} label="Rooms in house" value={snapshot?.inHouse ?? 0} loading={ops.isPending} />
          <StatTile icon={Users} label="Guests in house" value={snapshot?.guestsInHouse ?? 0} loading={ops.isPending} />
        </div>
        {snapshot && snapshot.bookedToday > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {snapshot.bookedToday} booking{snapshot.bookedToday === 1 ? "" : "s"} taken today,
            worth {money(snapshot.bookedTodayValue)}.
          </p>
        )}
      </section>

      {/* Commercial performance */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Performance</h2>
          <div className="flex gap-1.5">
            {ranges.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setWindowDays(option.days)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  windowDays === option.days
                    ? "border-accent text-accent"
                    : "border-border/70 text-muted-foreground hover:border-accent/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Last {windowDays} days, against the {windowDays} before it.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Occupancy" value={percent(occupancy, 1)}
            current={occupancy} previous={prevOccupancy} kind="rate"
            hint={`${totals.roomNightsSold}/${totals.roomNightsAvailable} nights`}
          />
          <KpiCard
            label="ADR" value={money(adr)} current={adr} previous={prevAdr} kind="amount"
            hint="per night sold"
          />
          <KpiCard
            label="RevPAR" value={money(revpar)} current={revpar} previous={prevRevpar} kind="amount"
            hint="per available room"
          />
          <KpiCard
            label="Revenue" value={money(totals.totalRevenue)}
            current={totals.totalRevenue} previous={totals.prevTotalRevenue} kind="amount"
            hint="rooms + experiences"
          />
        </div>

        <div className="mt-5 rounded-2xl border border-border/70 bg-card p-4 sm:p-6">
          {revenue.isPending ? (
            <div className="h-36 animate-pulse rounded-lg bg-secondary" />
          ) : (
            <RevenueChart days={revenue.data ?? []} />
          )}
        </div>
      </section>

      {/* Per-property comparison, only worth showing for a group */}
      {canSeeAll && !selectedId && rows.length > 1 && (
        <section>
          <h2 className="font-display text-xl">By property</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70 bg-card">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-normal">Property</th>
                  <th className="px-4 py-3 text-right font-normal">Occ.</th>
                  <th className="px-4 py-3 text-right font-normal">ADR</th>
                  <th className="px-4 py-3 text-right font-normal">RevPAR</th>
                  <th className="px-4 py-3 text-right font-normal">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.current.propertyId} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      {row.current.propertyName}
                      <span className="block text-xs text-muted-foreground">
                        {row.current.activeRooms} rooms
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{percent(row.current.occupancyRate, 1)}</td>
                    <td className="px-4 py-3 text-right">{money(row.current.adr)}</td>
                    <td className="px-4 py-3 text-right">{money(row.current.revpar)}</td>
                    <td className="px-4 py-3 text-right">{money(row.current.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ActionCard({
  href, icon: Icon, title, detail,
}: {
  href: Route;
  icon: typeof Wallet;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-accent/40 bg-accent/5 p-4 transition-colors hover:border-accent"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
        <Icon className="h-4 w-4 text-accent" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

function StatTile({
  icon: Icon, label, value, loading,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <Icon className="h-4 w-4 text-accent" />
      <p className="mt-3 font-display text-2xl sm:text-3xl">
        {loading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-secondary" /> : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
