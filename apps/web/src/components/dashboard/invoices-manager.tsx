"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Download, Mail, Plus, Receipt, RotateCcw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { DocumentSheetView } from "@/components/sheet/document-sheet-view";
import { invoiceSheet } from "@/lib/invoice/invoice-sheet";
import { trpc } from "@/utils/trpc";

import { BookingDrawer } from "./booking-drawer";
import { InvoiceBuilder } from "./invoice-builder";
import { useProperties } from "./property-context";
import { BulkBar } from "./ui/bulk-bar";
import { DataTable, type Column } from "./ui/data-table";
import { Drawer } from "./ui/overlay";
import { FilterPills, PageHeader, SearchInput, StatTile, StatusChip, type ChipTone } from "./ui/page";

const filters = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

const CHIPS: Record<string, { label: string; tone: ChipTone }> = {
  issued: { label: "Unpaid", tone: "gold" },
  paid: { label: "Paid", tone: "good" },
  void: { label: "Void", tone: "neutral" },
};

export const invoiceChip = (status: string) => CHIPS[status] ?? { label: status, tone: "neutral" as ChipTone };

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

function shortDay(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

type Row = { id: string; label: string; status: string; billedTo: string; company: string | null; reference: string | null; issuedOn: string; totalCents: number; balanceCents: number; propertyName: string };

/** Several invoices' PDFs in one zip; one is just its PDF. */
function downloadPdfs(ids: string[]) {
  if (ids.length === 1) window.location.assign(`/invoice/${ids[0]}/pdf`);
  else window.location.assign(`/dashboard/documents/zip?kind=invoice&ids=${ids.join(",")}`);
}

export default function InvoicesManager() {
  const { selectedId, selected } = useProperties();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string>();
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => setPicked(new Set()), [filter, search, selectedId]);

  const invoices = useQuery(trpc.invoices.list.queryOptions({ propertyId: selectedId, status: filter === "all" ? undefined : filter, search: search || undefined }));
  const stats = useQuery(trpc.invoices.stats.queryOptions({ propertyId: selectedId }));

  const after = (message: (changed: number) => string) => ({
    onSuccess: async ({ changed }: { changed: number }) => {
      toast.success(message(changed));
      setPicked(new Set());
      await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  });
  const setPaid = useMutation(trpc.invoices.setPaid.mutationOptions(after((changed) => `${changed} marked`)));
  const voidMany = useMutation(trpc.invoices.void.mutationOptions(after((changed) => `${changed} voided`)));

  const columns: Column<Row>[] = [
    {
      key: "to",
      header: "Billed to",
      sortValue: (row) => row.billedTo.toLowerCase(),
      render: (row) => (
        <span className="block min-w-0">
          <span className="block font-medium">{row.company ?? row.billedTo}</span>
          <span className="block font-mono text-xs tracking-wider text-accent">{row.label}</span>
        </span>
      ),
    },
    { key: "ref", header: "Ref no.", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.reference ?? "—"}</span> },
    { key: "property", header: "Property", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.propertyName}</span> },
    { key: "date", header: "Date", hideBelow: "md", sortValue: (row) => row.issuedOn, render: (row) => shortDay(row.issuedOn) },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const chip = invoiceChip(row.status);
        return <StatusChip tone={chip.tone}>{chip.label}</StatusChip>;
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.totalCents,
      render: (row) => (
        <span className="block">
          <span className="block font-medium">{money(row.totalCents)}</span>
          {row.balanceCents > 0 && row.balanceCents < row.totalCents && <span className="block text-xs text-muted-foreground">{money(row.balanceCents)} due</span>}
        </span>
      ),
    },
  ];

  const ids = [...picked];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        subtitle={selected?.name ?? "All properties"}
        actions={
          <button type="button" onClick={() => setBuilding(true)} className={buttonClass({ shape: "pill" })}>
            <Plus aria-hidden />
            New invoice
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile tone="gold" icon={Receipt} label="Billed this month" value={money(stats.data?.billedThisMonthCents ?? 0)} hint={`${stats.data?.issuedThisMonth ?? 0} invoices`} loading={stats.isPending} />
        <StatTile tone="clay" icon={Wallet} label="Still owed" value={money(stats.data?.outstandingCents ?? 0)} hint={`${stats.data?.unpaidCount ?? 0} unpaid`} loading={stats.isPending} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={typed} onChange={setTyped} placeholder="Search name, company, ref or number" className="w-full lg:w-80" />
        <FilterPills label="Filter invoices" options={filters} value={filter} onChange={setFilter} />
      </div>

      {invoices.isError ? (
        <ErrorMessage title="Invoices didn't load" error={invoices.error} onRetry={() => void invoices.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={invoices.data as Row[] | undefined}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          rowLabel={(row) => row.label}
          loading={invoices.isPending}
          selection={{ selected: picked, onChange: setPicked }}
          empty={
            <StateMessage
              icon={Receipt}
              title={search || filter !== "all" ? "No invoices match" : "No invoices yet"}
              description="Issue one here, or from a booking's page. Each is numbered, kept, and can be emailed or printed."
            />
          }
        />
      )}

      <BulkBar
        count={picked.size}
        noun={["invoice", "invoices"]}
        onClear={() => setPicked(new Set())}
        actions={[
          { key: "download", label: "Download PDFs", icon: Download, onClick: () => downloadPdfs(ids) },
          { key: "paid", label: "Mark paid", icon: CheckCircle2, onClick: () => setPaid.mutateAsync({ ids, paid: true }) },
          { key: "unpaid", label: "Mark unpaid", icon: RotateCcw, onClick: () => setPaid.mutateAsync({ ids, paid: false }) },
          { key: "void", label: "Void", icon: Ban, danger: true, confirm: "Void them? They stay on file, marked void.", onClick: () => voidMany.mutateAsync(ids) },
        ]}
      />

      <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(undefined)} />
      {building && (
        <InvoiceBuilder
          onClose={() => setBuilding(false)}
          onIssued={(id) => {
            setBuilding(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

/** One invoice: the sheet itself, and what can be done with it. */
export function InvoiceDrawer({ invoiceId, onClose }: { invoiceId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const invoice = useQuery({ ...trpc.invoices.byId.queryOptions(invoiceId ?? ""), enabled: Boolean(invoiceId) });
  const [bookingId, setBookingId] = useState<string>();
  const data = invoice.data;

  const refresh = async (message: string) => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
  };
  const failed = (error: { message?: string }) => toast.error(friendlyError(error));
  const email = useMutation(trpc.invoices.email.mutationOptions({ onSuccess: () => void refresh("Emailed"), onError: failed }));
  const setPaid = useMutation(trpc.invoices.setPaid.mutationOptions({ onSuccess: () => void refresh("Updated"), onError: failed }));
  const voidOne = useMutation(trpc.invoices.void.mutationOptions({ onSuccess: () => void refresh("Voided"), onError: failed }));
  const chip = data ? invoiceChip(data.status) : undefined;

  return (
    <Drawer open={Boolean(invoiceId)} onClose={onClose} title={data ? (data.company ?? data.billedTo) : "Invoice"} description={data ? <span className="font-mono tracking-wider text-accent">{data.label}</span> : undefined}>
      {invoice.isPending && <Skeleton className="h-96 w-full rounded-2xl" />}
      {invoice.isError && <ErrorMessage title="This invoice didn't load" error={invoice.error} onRetry={() => void invoice.refetch()} />}
      {data && chip && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            <span className="text-xs text-muted-foreground">
              {data.property.name}
              {data.sentAt ? ` · emailed ${data.sendCount > 1 ? `${data.sendCount} times` : "once"}` : ""}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={`/invoice/${data.id}/pdf`} className={buttonClass({ size: "sm" })}>
              <Download aria-hidden />
              PDF
            </a>
            {data.status !== "void" && (
              <button type="button" disabled={email.isPending || !data.email} title={data.email || "No email on this invoice"} onClick={() => email.mutate(data.id)} className={buttonClass({ size: "sm", variant: "secondary" })}>
                {email.isPending ? <Spinner /> : <Mail aria-hidden />}
                {data.sendCount > 0 ? "Email again" : "Email"}
              </button>
            )}
            {data.status === "issued" && (
              <button type="button" disabled={setPaid.isPending} onClick={() => setPaid.mutate({ ids: [data.id], paid: true })} className={buttonClass({ size: "sm", variant: "secondary" })}>
                <CheckCircle2 aria-hidden />
                Mark paid
              </button>
            )}
            {data.status === "paid" && (
              <button type="button" disabled={setPaid.isPending} onClick={() => setPaid.mutate({ ids: [data.id], paid: false })} className={buttonClass({ size: "sm", variant: "ghost" })}>
                <RotateCcw aria-hidden />
                Mark unpaid
              </button>
            )}
            {data.status !== "void" && (
              <button
                type="button"
                disabled={voidOne.isPending}
                onClick={() => {
                  if (window.confirm(`Void ${data.label}? It stays on file, marked void.`)) voidOne.mutate([data.id]);
                }}
                className={buttonClass({ size: "sm", variant: "ghost" })}
              >
                <Ban aria-hidden />
                Void
              </button>
            )}
            {data.bookingId && (
              <button type="button" onClick={() => setBookingId(data.bookingId!)} className={buttonClass({ size: "sm", variant: "ghost" })}>
                Open booking
              </button>
            )}
          </div>

          <DocumentSheetView sheet={invoiceSheet(data)} className="animate-rise-in" />
        </div>
      )}
      <BookingDrawer bookingId={bookingId} onClose={() => setBookingId(undefined)} />
    </Drawer>
  );
}
