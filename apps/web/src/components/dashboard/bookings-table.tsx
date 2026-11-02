"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, Download, LogIn, LogOut, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, friendlyError, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { filters, type FilterKey } from "./booking-filters";
import { BookingDrawer } from "./booking-drawer";
import { bookingChip, channelName, paymentChip } from "./booking-labels";
import { money } from "./kpi";
import { NewBookingModal } from "./new-booking-modal";
import { useProperties } from "./property-context";
import { BulkBar } from "./ui/bulk-bar";
import { downloadCsv } from "./ui/csv";
import { DataTable, type Column } from "./ui/data-table";
import { FilterPills, PageHeader, SearchInput, StatusChip } from "./ui/page";

const PAGE_SIZE = 25;
/** The most a CSV export carries; narrow by filter or search for anything past it. */
const EXPORT_LIMIT = 5000;

/** Stay dates are stored as UTC midnights, so they are formatted in UTC or they shift a day. */
function formatStay(checkIn: string, checkOut: string): string {
  const day = { timeZone: "UTC", day: "numeric", month: "short" } as const;
  const from = new Date(checkIn).toLocaleDateString("en-GB", day);
  const to = new Date(checkOut).toLocaleDateString("en-GB", { ...day, year: "numeric" });
  return `${from} – ${to}`;
}

const CSV_HEADER = ["Reference", "Guest", "Email", "Phone", "Property", "Room", "Arrive", "Leave", "Nights", "Guests", "Source", "Status", "Payment", "Total", "Paid", "Method"];

function csvLine(row: Row) {
  return [
    row.reference, row.guestName, row.guestEmail, row.guestPhone, row.propertyName, row.roomName,
    row.checkIn.slice(0, 10), row.checkOut.slice(0, 10), row.nights, row.guests, channelName(row.channel),
    bookingChip(row).label, paymentChip(row.paymentStatus).label, row.totalAmount, row.amountPaid, row.paymentMethod,
  ];
}

type Row = {
  id: string;
  reference: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  channel: string;
  bookingStatus: string;
  paymentStatus: string;
  amountPaid: number;
  totalAmount: number;
  paymentMethod: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  reviewNote: string | null;
};

export default function BookingsTable({ initialFilter = "all" }: { initialFilter?: FilterKey }) {
  const { selectedId, selected } = useProperties();
  const [filterKey, setFilterKey] = useState<FilterKey>(initialFilter);
  const filter = filters.find((candidate) => candidate.key === filterKey) ?? filters[0];
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const queryClient = useQueryClient();

  // Searches once typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(typed.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const query = { ...filter.query, propertyId: selectedId, search: search || undefined };
  const bookings = useQuery(trpc.bookings.search.queryOptions({ ...query, page, pageSize: PAGE_SIZE }));
  const rows = bookings.data?.rows as Row[] | undefined;

  // The selection outlives paging: every row seen is remembered, so a ticked
  // booking on page 1 is still exported from page 3.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const seen = useRef(new Map<string, Row>());
  for (const row of rows ?? []) seen.current.set(row.id, row);
  useEffect(() => setPicked(new Set()), [filterKey, search, selectedId]);
  const [selectingAll, setSelectingAll] = useState(false);
  const pageAllPicked = Boolean(rows?.length) && rows!.every((row) => picked.has(row.id));
  const total = bookings.data?.total ?? 0;

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const all = await queryClient.fetchQuery(trpc.bookings.search.queryOptions({ ...query, page: 0, pageSize: EXPORT_LIMIT }));
      for (const row of all.rows as Row[]) seen.current.set(row.id, row);
      setPicked(new Set((all.rows as Row[]).map((row) => row.id)));
    } catch (error) {
      toast.error(friendlyError(error as Error));
    } finally {
      setSelectingAll(false);
    }
  }

  const pickedRows = [...picked].map((id) => seen.current.get(id)).filter((row): row is Row => Boolean(row));
  const checkInOne = useMutation(trpc.bookings.checkIn.mutationOptions());
  const checkOutOne = useMutation(trpc.bookings.checkOut.mutationOptions());

  /** One at a time, through the same checks as the drawer's buttons; says how many went. */
  async function forEachPicked(run: (id: string) => Promise<unknown>, eligible: (row: Row) => boolean, done: string) {
    const targets = pickedRows.filter(eligible);
    let ok = 0;
    for (const row of targets) {
      try {
        await run(row.id);
        ok++;
      } catch {
        // Counted below; the drawer shows each one's reason.
      }
    }
    const skipped = pickedRows.length - ok;
    if (ok) toast.success(`${ok} ${done}`);
    if (skipped) toast.warning(`${skipped} skipped: not ready for that (unpaid, cancelled, or already done). Open one to see why.`);
    setPicked(new Set());
    await queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await queryClient.fetchQuery(trpc.bookings.search.queryOptions({ ...query, page: 0, pageSize: EXPORT_LIMIT }));
      downloadCsv(`forest-creek-bookings-${new Date().toISOString().slice(0, 10)}.csv`, [CSV_HEADER, ...(all.rows as Row[]).map(csvLine)]);
      if (all.total > EXPORT_LIMIT) toast.warning(`Exported the newest ${EXPORT_LIMIT} of ${all.total}. Filter to narrow it down.`);
    } catch (error) {
      toast.error(friendlyError(error as Error));
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "guest",
      header: "Guest",
      sortValue: (row) => row.guestName.toLowerCase(),
      render: (row) => (
        <span className="block min-w-0">
          <span className="block font-medium">{row.guestName}</span>
          <span className="block font-mono text-xs tracking-wider text-accent">{row.reference}</span>
        </span>
      ),
    },
    {
      key: "stay",
      header: "Stay",
      sortValue: (row) => row.checkIn,
      render: (row) => (
        <>
          <span className="block whitespace-nowrap">{formatStay(row.checkIn, row.checkOut)}</span>
          <span className="block text-xs text-muted-foreground">
            {row.nights} {row.nights === 1 ? "night" : "nights"}
          </span>
        </>
      ),
    },
    {
      key: "room",
      header: "Room",
      hideBelow: "lg",
      sortValue: (row) => row.roomName.toLowerCase(),
      render: (row) => (
        <>
          <span className="block">{row.roomName}</span>
          {!selectedId && <span className="block text-xs text-muted-foreground">{row.propertyName}</span>}
        </>
      ),
    },
    { key: "source", header: "Source", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{channelName(row.channel)}</span> },
    {
      key: "status",
      header: "Status",
      hideBelow: "sm",
      render: (row) => {
        const chip = bookingChip(row);
        return <StatusChip tone={chip.tone}>{chip.label}</StatusChip>;
      },
    },
    {
      key: "payment",
      header: "Payment",
      hideBelow: "md",
      render: (row) => {
        const chip = paymentChip(row.paymentStatus);
        return <StatusChip tone={chip.tone}>{chip.label}</StatusChip>;
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.totalAmount,
      render: (row) => (
        <>
          <span className="block font-medium">{money(row.totalAmount)}</span>
          {row.amountPaid > 0 && row.amountPaid < row.totalAmount && (
            <span className="block text-xs text-muted-foreground">{money(row.amountPaid)} paid</span>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookings"
        subtitle={`${selected?.name ?? "All properties"}${bookings.data ? ` · ${bookings.data.total} ${bookings.data.total === 1 ? "booking" : "bookings"}` : ""}`}
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={exporting || !bookings.data?.total} className={buttonClass({ variant: "secondary", shape: "pill" })}>
              <Download aria-hidden />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button type="button" onClick={() => setCreating(true)} className={buttonClass({ shape: "pill" })}>
              <Plus aria-hidden />
              New booking
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <SearchInput value={typed} onChange={setTyped} placeholder="Search reference, name, email or phone" className="w-full xl:w-80" />
        <FilterPills
          label="Filter bookings"
          options={filters}
          value={filterKey}
          onChange={(key) => {
            setFilterKey(key);
            setPage(0);
          }}
        />
      </div>

      {filterKey === "maybe" && (rows?.length ?? 0) > 0 && (
        <p className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
          Unpaid bookings. They don&rsquo;t hold the room and aren&rsquo;t counted as income: the first payment
          (deposit or full) secures the stay and moves it to Booked. Anyone else who pays first gets the dates.
        </p>
      )}

      {pageAllPicked && total > (rows?.length ?? 0) && picked.size < total && (
        <p className="animate-rise-in rounded-2xl bg-accent/10 px-4 py-2.5 text-center text-sm">
          {picked.size} selected.{" "}
          <button type="button" disabled={selectingAll} onClick={() => void selectAllMatching()} className="font-medium text-accent hover:underline">
            {selectingAll ? "Selecting…" : `Select all ${Math.min(total, EXPORT_LIMIT)} matching`}
          </button>
        </p>
      )}

      {bookings.isError ? (
        <ErrorMessage title="Bookings didn't load" error={bookings.error} onRetry={() => void bookings.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          rowLabel={(row) => `Open ${row.reference}`}
          loading={bookings.isPending}
          pageSize={PAGE_SIZE}
          selection={{ selected: picked, onChange: setPicked }}
          empty={
            <StateMessage
              icon={CalendarRange}
              title={
                search
                  ? "No booking matches that"
                  : filterKey === "maybe"
                    ? "No unpaid bookings"
                    : filterKey === "refunds"
                      ? "No refunds outstanding"
                      : filterKey === "attention"
                        ? "Nothing needs attention"
                        : "No bookings here yet"
              }
              description={
                search
                  ? "Check the spelling, or search by reference or phone."
                  : filterKey === "maybe"
                    ? "Bookings nobody has paid for yet appear here. They don't hold a room and aren't counted as income."
                    : filterKey === "refunds"
                      ? "Cancelled bookings that were already paid will appear here until the refund is recorded."
                      : "Bookings from the website, WhatsApp and staff will appear here as they come in."
              }
            />
          }
          footer={
            (bookings.data?.pages ?? 1) > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-40">
                  <ChevronLeft className="size-3.5" /> Prev
                </button>
                <span>
                  Page {page + 1} of {bookings.data?.pages}
                </span>
                <button
                  type="button"
                  disabled={page >= (bookings.data?.pages ?? 1) - 1}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-40"
                >
                  Next <ChevronRight className="size-3.5" />
                </button>
              </div>
            ) : (
              <span />
            )
          }
        />
      )}

      <BulkBar
        count={picked.size}
        noun={["booking", "bookings"]}
        onClear={() => setPicked(new Set())}
        actions={[
          {
            key: "export",
            label: "Export",
            icon: Download,
            onClick: () => downloadCsv(`forest-creek-bookings-selected-${new Date().toISOString().slice(0, 10)}.csv`, [CSV_HEADER, ...pickedRows.map(csvLine)]),
          },
          {
            key: "in",
            label: "Check in",
            icon: LogIn,
            onClick: () => forEachPicked((id) => checkInOne.mutateAsync(id), (row) => !row.checkedInAt && row.bookingStatus === "confirmed", "checked in"),
          },
          {
            key: "out",
            label: "Check out",
            icon: LogOut,
            onClick: () => forEachPicked((id) => checkOutOne.mutateAsync(id), (row) => Boolean(row.checkedInAt) && !row.checkedOutAt, "checked out"),
          },
        ]}
      />
      <BookingDrawer bookingId={openId} onClose={() => setOpenId(undefined)} />
      {creating && (
        <NewBookingModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
