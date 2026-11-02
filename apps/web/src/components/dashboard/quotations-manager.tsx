"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Percent, Plus, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { money } from "./kpi";
import { useProperties } from "./property-context";
import { QuoteBuilder } from "./quote-builder";
import { QuoteDrawer } from "./quote-drawer";
import { quoteChip } from "./quote-labels";
import { DataTable, type Column } from "./ui/data-table";
import { FilterPills, PageHeader, SearchInput, StatTile, StatusChip } from "./ui/page";

const filters = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "sent", label: "Sent" },
  { key: "viewed", label: "Viewed" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "expired", label: "Expired" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

type Row = {
  id: string;
  label: string;
  guestName: string;
  company: string | null;
  status: string;
  total: number;
  validUntil: string;
  createdAt: string;
  property: { name: string };
};

function shortDay(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

export default function QuotationsManager() {
  const { selectedId, selected } = useProperties();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string>();
  const [building, setBuilding] = useState<{ editId?: string } | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const quotes = useQuery(
    trpc.quotes.list.queryOptions({ propertyId: selectedId, status: filter === "all" ? undefined : filter, search: search || undefined }),
  );
  const stats = useQuery(trpc.quotes.stats.queryOptions({ propertyId: selectedId }));

  const columns: Column<Row>[] = [
    {
      key: "guest",
      header: "Guest",
      sortValue: (row) => row.guestName.toLowerCase(),
      render: (row) => (
        <span className="block min-w-0">
          <span className="block font-medium">{row.guestName}</span>
          <span className="block font-mono text-xs tracking-wider text-accent">{row.label}</span>
        </span>
      ),
    },
    { key: "company", header: "Company", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.company ?? "—"}</span> },
    { key: "property", header: "Property", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.property.name}</span> },
    { key: "valid", header: "Valid until", hideBelow: "md", sortValue: (row) => row.validUntil, render: (row) => shortDay(row.validUntil) },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const chip = quoteChip(row.status);
        return <StatusChip tone={chip.tone}>{chip.label}</StatusChip>;
      },
    },
    { key: "total", header: "Total", align: "right", sortValue: (row) => row.total, render: (row) => <span className="font-medium">{money(row.total)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quotations"
        subtitle={selected?.name ?? "All properties"}
        actions={
          <button type="button" onClick={() => setBuilding({})} className={buttonClass({ shape: "pill" })}>
            <Plus aria-hidden />
            New quotation
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          tone="gold"
          icon={Send}
          label="Waiting on guests"
          value={money(stats.data?.openValue ?? 0)}
          hint={`${stats.data?.openCount ?? 0} open`}
          loading={stats.isPending}
        />
        <StatTile
          tone="moss"
          icon={CheckCircle2}
          label="Accepted"
          value={money(stats.data?.acceptedValue ?? 0)}
          hint={`${stats.data?.acceptedCount ?? 0} quotations`}
          loading={stats.isPending}
        />
        <StatTile
          tone="clay"
          icon={Percent}
          label="Acceptance rate"
          value={stats.data?.acceptanceRate == null ? "—" : `${Math.round(stats.data.acceptanceRate * 100)}%`}
          hint="of quotations answered or expired"
          loading={stats.isPending}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={typed} onChange={setTyped} placeholder="Search name, company or number" className="w-full lg:w-72" />
        <FilterPills label="Filter quotations" options={filters} value={filter} onChange={setFilter} />
      </div>

      {quotes.isError ? (
        <ErrorMessage title="Quotations didn't load" error={quotes.error} onRetry={() => void quotes.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={quotes.data as Row[] | undefined}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          rowLabel={(row) => `Open ${row.label}`}
          loading={quotes.isPending}
          empty={
            <StateMessage
              icon={FileText}
              title={search || filter !== "all" ? "No quotations match" : "No quotations yet"}
              description="Write a quotation for a stay or an event, and send it by email or WhatsApp."
            />
          }
        />
      )}

      <QuoteDrawer
        quoteId={openId}
        onClose={() => setOpenId(undefined)}
        onEdit={(id) => {
          setOpenId(undefined);
          setBuilding({ editId: id });
        }}
        onDuplicated={(id) => setOpenId(id)}
      />
      {building && (
        <QuoteBuilder
          editId={building.editId}
          onClose={() => setBuilding(undefined)}
          onSaved={(id) => {
            setBuilding(undefined);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
