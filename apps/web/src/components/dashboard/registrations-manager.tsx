"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardSignature, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { RegistrationView } from "@/components/sheet/registration-view";
import { trpc } from "@/utils/trpc";

import { BookingDrawer } from "./booking-drawer";
import { useProperties } from "./property-context";
import { RegistrationBuilder } from "./registration-builder";
import { BulkBar } from "./ui/bulk-bar";
import { DataTable, type Column } from "./ui/data-table";
import { Drawer } from "./ui/overlay";
import { PageHeader, SearchInput, StatusChip } from "./ui/page";

type Row = { id: string; label: string; guestName: string; party: number; roomName: string; checkIn: string; checkOut: string; nights: number; signed: boolean; bookingId: string | null; propertyName: string };

function shortDay(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

export function downloadRegistrations(ids: string[]) {
  if (ids.length === 1) window.location.assign(`/dashboard/registrations/${ids[0]}/pdf`);
  else window.location.assign(`/dashboard/documents/zip?kind=registration&ids=${ids.join(",")}`);
}

export default function RegistrationsManager() {
  const { selectedId, selected } = useProperties();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string>();
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => setPicked(new Set()), [search, selectedId]);

  const cards = useQuery(trpc.registrations.list.queryOptions({ propertyId: selectedId, search: search || undefined }));
  const remove = useMutation(
    trpc.registrations.delete.mutationOptions({
      onSuccess: async ({ deleted }) => {
        toast.success(`${deleted} deleted`);
        setPicked(new Set());
        await queryClient.invalidateQueries({ queryKey: trpc.registrations.pathKey() });
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

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
    { key: "room", header: "Room", hideBelow: "md", render: (row) => <span className="text-muted-foreground">{row.roomName}</span> },
    { key: "property", header: "Property", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.propertyName}</span> },
    {
      key: "stay",
      header: "Stay",
      sortValue: (row) => row.checkIn,
      render: (row) => (
        <span className="block">
          <span className="block whitespace-nowrap">{shortDay(row.checkIn)}</span>
          <span className="block text-xs text-muted-foreground">
            {row.nights} {row.nights === 1 ? "night" : "nights"} · {row.party} {row.party === 1 ? "guest" : "guests"}
          </span>
        </span>
      ),
    },
    { key: "signed", header: "Signed", align: "right", render: (row) => <StatusChip tone={row.signed ? "good" : "neutral"}>{row.signed ? "Signed" : "Not signed"}</StatusChip> },
  ];

  const ids = [...picked];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registrations"
        subtitle={`${selected?.name ?? "All properties"} · guest registration cards`}
        actions={
          <button type="button" onClick={() => setBuilding(true)} className={buttonClass({ shape: "pill" })}>
            <Plus aria-hidden />
            New card
          </button>
        }
      />
      <SearchInput value={typed} onChange={setTyped} placeholder="Search name, room, car or card number" className="w-full lg:w-80" />

      {cards.isError ? (
        <ErrorMessage title="Registration cards didn't load" error={cards.error} onRetry={() => void cards.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={cards.data as Row[] | undefined}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          rowLabel={(row) => row.label}
          loading={cards.isPending}
          selection={{ selected: picked, onChange: setPicked }}
          empty={
            <StateMessage
              icon={ClipboardSignature}
              title={search ? "No card matches that" : "No registration cards yet"}
              description="Register guests as they arrive, from their booking or here. They sign on the screen."
            />
          }
        />
      )}

      <BulkBar
        count={picked.size}
        noun={["card", "cards"]}
        onClear={() => setPicked(new Set())}
        actions={[
          { key: "download", label: "Download PDFs", icon: Download, onClick: () => downloadRegistrations(ids) },
          { key: "delete", label: "Delete", icon: Trash2, danger: true, confirm: "Delete for good? Only for cards made by mistake.", onClick: () => remove.mutateAsync(ids) },
        ]}
      />

      <RegistrationDrawer cardId={openId} onClose={() => setOpenId(undefined)} />
      {building && (
        <RegistrationBuilder
          onClose={() => setBuilding(false)}
          onSaved={(id) => {
            setBuilding(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

/** One card: as printed, with its PDF and the booking it belongs to. */
export function RegistrationDrawer({ cardId, onClose }: { cardId?: string; onClose: () => void }) {
  const card = useQuery({ ...trpc.registrations.byId.queryOptions(cardId ?? ""), enabled: Boolean(cardId) });
  const [bookingId, setBookingId] = useState<string>();
  const data = card.data;
  return (
    <Drawer open={Boolean(cardId)} onClose={onClose} title={data?.guestName ?? "Registration card"} description={data ? <span className="font-mono tracking-wider text-accent">{data.label}</span> : undefined}>
      {card.isPending && <Skeleton className="h-96 w-full rounded-2xl" />}
      {card.isError && <ErrorMessage title="This card didn't load" error={card.error} onRetry={() => void card.refetch()} />}
      {data && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <a href={`/dashboard/registrations/${data.id}/pdf`} className={buttonClass({ size: "sm" })}>
              <Download aria-hidden />
              PDF
            </a>
            {data.bookingId && (
              <button type="button" onClick={() => setBookingId(data.bookingId!)} className={buttonClass({ size: "sm", variant: "ghost" })}>
                Open booking
              </button>
            )}
          </div>
          <RegistrationView card={data} className="animate-rise-in" />
        </div>
      )}
      <BookingDrawer bookingId={bookingId} onClose={() => setBookingId(undefined)} />
    </Drawer>
  );
}
