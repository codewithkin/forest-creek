"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { LetterView } from "@/components/sheet/letter-view";
import { trpc } from "@/utils/trpc";

import { LetterBuilder } from "./letter-builder";
import { useProperties } from "./property-context";
import { BulkBar } from "./ui/bulk-bar";
import { DataTable, type Column } from "./ui/data-table";
import { Drawer } from "./ui/overlay";
import { PageHeader, SearchInput } from "./ui/page";

type Row = { id: string; label: string; subject: string; to: string; letterDate: string; signerName: string; propertyName: string };

function shortDay(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

function downloadLetters(ids: string[]) {
  if (ids.length === 1) window.location.assign(`/dashboard/letters/${ids[0]}/pdf`);
  else window.location.assign(`/dashboard/documents/zip?kind=letter&ids=${ids.join(",")}`);
}

export default function LettersManager() {
  const { selectedId, selected } = useProperties();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string>();
  const [building, setBuilding] = useState<{ editId?: string }>();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => setPicked(new Set()), [search, selectedId]);

  const letters = useQuery(trpc.letters.list.queryOptions({ propertyId: selectedId, search: search || undefined }));
  const remove = useMutation(
    trpc.letters.delete.mutationOptions({
      onSuccess: async ({ deleted }) => {
        toast.success(`${deleted} deleted`);
        setPicked(new Set());
        setOpenId(undefined);
        await queryClient.invalidateQueries({ queryKey: trpc.letters.pathKey() });
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const columns: Column<Row>[] = [
    {
      key: "subject",
      header: "Subject",
      sortValue: (row) => row.subject.toLowerCase(),
      render: (row) => (
        <span className="block min-w-0">
          <span className="block font-medium">{row.subject}</span>
          <span className="block font-mono text-xs tracking-wider text-accent">{row.label}</span>
        </span>
      ),
    },
    { key: "to", header: "To", hideBelow: "sm", render: (row) => <span className="text-muted-foreground">{row.to}</span> },
    { key: "by", header: "Signed by", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.signerName}</span> },
    { key: "date", header: "Date", align: "right", sortValue: (row) => row.letterDate, render: (row) => <span className="whitespace-nowrap">{shortDay(row.letterDate)}</span> },
  ];

  const ids = [...picked];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Letters"
        subtitle={`${selected?.name ?? "All properties"} · on the letterhead`}
        actions={
          <button type="button" onClick={() => setBuilding({})} className={buttonClass({ shape: "pill" })}>
            <Plus aria-hidden />
            New letter
          </button>
        }
      />
      <SearchInput value={typed} onChange={setTyped} placeholder="Search subject, recipient or words" className="w-full lg:w-80" />

      {letters.isError ? (
        <ErrorMessage title="Letters didn't load" error={letters.error} onRetry={() => void letters.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={letters.data as Row[] | undefined}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          rowLabel={(row) => row.subject}
          loading={letters.isPending}
          selection={{ selected: picked, onChange: setPicked }}
          empty={
            <StateMessage
              icon={Mail}
              title={search ? "No letter matches that" : "No letters yet"}
              description="Type a letter and it comes out on the Forest Creek letterhead, ready to print or send."
            />
          }
        />
      )}

      <BulkBar
        count={picked.size}
        noun={["letter", "letters"]}
        onClear={() => setPicked(new Set())}
        actions={[
          { key: "download", label: "Download PDFs", icon: Download, onClick: () => downloadLetters(ids) },
          { key: "delete", label: "Delete", icon: Trash2, danger: true, confirm: "Delete these letters for good?", onClick: () => remove.mutateAsync(ids) },
        ]}
      />

      <LetterDrawer
        letterId={openId}
        onClose={() => setOpenId(undefined)}
        onEdit={(id) => {
          setOpenId(undefined);
          setBuilding({ editId: id });
        }}
      />
      {building && (
        <LetterBuilder
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

function LetterDrawer({ letterId, onClose, onEdit }: { letterId?: string; onClose: () => void; onEdit: (id: string) => void }) {
  const letter = useQuery({ ...trpc.letters.byId.queryOptions(letterId ?? ""), enabled: Boolean(letterId) });
  const data = letter.data;
  return (
    <Drawer open={Boolean(letterId)} onClose={onClose} title={data?.subject ?? "Letter"} description={data ? <span className="font-mono tracking-wider text-accent">{data.label}</span> : undefined}>
      {letter.isPending && <Skeleton className="h-96 w-full rounded-2xl" />}
      {letter.isError && <ErrorMessage title="This letter didn't load" error={letter.error} onRetry={() => void letter.refetch()} />}
      {data && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <a href={`/dashboard/letters/${data.id}/pdf`} className={buttonClass({ size: "sm" })}>
              <Download aria-hidden />
              PDF
            </a>
            <button type="button" onClick={() => onEdit(data.id)} className={buttonClass({ size: "sm", variant: "secondary" })}>
              <Pencil aria-hidden />
              Edit
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(data.body).then(() => toast.success("The letter's words are copied"))}
              className={buttonClass({ size: "sm", variant: "ghost" })}
            >
              <Copy aria-hidden />
              Copy text
            </button>
          </div>
          <LetterView letter={data} className="animate-rise-in" />
        </div>
      )}
    </Drawer>
  );
}
