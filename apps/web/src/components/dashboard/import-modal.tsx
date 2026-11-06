"use client";

import type { AppRouter } from "@forest-creek/api/routers/index";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { money } from "./kpi";
import { useProperties } from "./property-context";
import { downloadCsv } from "./ui/csv";
import { FilterPills } from "./ui/page";
import { DoneStep, StepModal } from "./ui/steps";

type Preview = inferRouterOutputs<AppRouter>["bookings"]["previewImport"];
type Row = Preview["rows"][number];
type Field = Preview["fields"][number];

const FIELD_NAMES: Record<Field, string> = {
  guest: "Guest",
  arrive: "Arrive",
  leave: "Leave",
  rooms: "Rooms",
  status: "Payment / status",
  total: "Total",
  notes: "Notes",
  ignore: "Leave out",
};

const steps = [
  { key: "paste", label: "Paste" },
  { key: "columns", label: "Columns" },
  { key: "check", label: "Check" },
  { key: "done", label: "Done" },
] as const;

const views = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "attention", label: "Needs attention" },
] as const;

function day(value: string | null): string {
  return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—";
}

function paymentWords(row: Row): string {
  const payment = row.payment;
  if (payment.kind === "arrival") return "Pays on arrival";
  if (payment.kind === "none") return "Not paid yet";
  const amount = payment.amount === "total" ? "In full" : money(payment.amount);
  return `${amount} by ${payment.method === "bank_transfer" ? "bank transfer" : "cash"}`;
}

/**
 * Bringing the bookings spreadsheet in, in four steps: paste the rows (or
 * pick the CSV), say which column is which (it guesses), check every row
 * (fix the rooms it couldn't match, skip what shouldn't come), done.
 */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const { properties, selectedId } = useProperties();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [propertyId, setPropertyId] = useState(selectedId ?? "");
  const [fields, setFields] = useState<Field[]>();
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [skip, setSkip] = useState<number[]>([]);
  const [view, setView] = useState<(typeof views)[number]["key"]>("all");
  const [fixing, setFixing] = useState<number>();

  const preview = useMutation(trpc.bookings.previewImport.mutationOptions({ onError: (error) => toast.error(friendlyError(error)) }));
  const run = useMutation(
    trpc.bookings.importBookings.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setStep(3);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  // Every room this person runs, for choosing rooms by hand.
  const roomLists = useQueries({ queries: properties.map((property) => trpc.properties.rooms.queryOptions({ propertyId: property.id })) });
  const allRooms = roomLists.flatMap((list, index) =>
    (list.data ?? []).filter((room) => room.active).map((room) => ({ id: room.id, name: room.name, propertyName: properties[index]!.name })),
  );

  const input = (extra: { fields?: Field[]; overrides?: Record<string, string[]>; skip?: number[] } = {}) => ({
    text,
    propertyId: propertyId || undefined,
    fields: extra.fields ?? fields,
    overrides: extra.overrides ?? overrides,
    skip: extra.skip ?? skip,
  });
  const refresh = (extra: Parameters<typeof input>[0]) => preview.mutate(input(extra));

  const data = preview.data;
  const rows = data?.rows ?? [];
  const ready = rows.filter((row) => !row.skipped && row.problems.length === 0);
  const attention = rows.filter((row) => !row.skipped && row.problems.length > 0);
  const shown = view === "ready" ? ready : view === "attention" ? attention : rows;

  const next =
    step === 0
      ? {
          label: "Read the rows",
          onClick: () =>
            preview.mutate(input({ fields: undefined }), {
              onSuccess: (result) => {
                setFields(result.fields);
                setStep(1);
              },
            }),
          disabled: !text.trim(),
          pending: preview.isPending,
        }
      : step === 1
        ? { label: "Check the rows", onClick: () => setStep(2), disabled: !fields?.includes("guest") || !fields.includes("arrive") || !fields.includes("rooms") }
        : step === 2
          ? {
              label: `Import ${ready.length} ${ready.length === 1 ? "booking" : "bookings"}`,
              onClick: () => run.mutate(input()),
              disabled: ready.length === 0 || preview.isPending,
              pending: run.isPending,
              icon: <Upload aria-hidden />,
            }
          : undefined;

  const results = run.data ?? [];
  const failed = results.filter((result) => !result.ok);

  return (
    <StepModal
      title="Import bookings"
      description="From the bookings spreadsheet: copy the rows in Excel and paste them here."
      icon={<FileSpreadsheet className="size-4" />}
      size={step === 0 ? "lg" : "xl"}
      steps={steps}
      current={step}
      onClose={onClose}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={
        step === 2 ? (
          <span className="text-sm">
            <span className="text-emerald-300">{ready.length} ready</span>
            {attention.length > 0 && <span className="ml-2 text-amber-300">{attention.length} need attention</span>}
            {skip.length > 0 && <span className="ml-2 text-muted-foreground">{skip.length} skipped</span>}
          </span>
        ) : undefined
      }
    >
      {step === 0 && (
        <div className="space-y-4">
          {properties.length > 1 && (
            <label className="block text-xs">
              Rooms named without a property are at
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm">
                <option value="" className="bg-popover">
                  Any property (best match)
                </option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id} className="bg-popover">
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            The rows (guest, arrival, departure, rooms, payment, total, notes; any order)
            <textarea
              autoFocus
              rows={12}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"Vivian Chiridza\t13-Nov-26\t14-Nov-26\tGinger Lillian\tpaid\t$120\nCBZ Trish\t5-Dec-26\t6-Dec-26\tCaraway, Parsley, Mint\tdeposited CBZ $1200\t$2,610"}
              className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Upload aria-hidden />
              Or choose a CSV file
            </button>
            Nothing is saved until the last step.
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(setText);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      )}

      {step === 1 && data && fields && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Worked out from what the columns hold{data.hasHeader ? " and their headings" : ""}. Change any that are wrong.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {fields.map((field, index) => (
                    <th key={index} className="border-b border-border/60 p-2 text-left font-normal">
                      <select
                        value={field}
                        onChange={(event) => {
                          const next = fields.map((current, at) => (at === index ? (event.target.value as Field) : current === event.target.value && event.target.value !== "ignore" ? "ignore" : current));
                          setFields(next);
                          refresh({ fields: next });
                        }}
                        className={`w-full rounded-lg border bg-transparent px-2 py-1.5 ${field === "ignore" ? "border-border/60 text-muted-foreground" : "border-accent/60 text-accent"}`}
                      >
                        {(Object.keys(FIELD_NAMES) as Field[]).map((option) => (
                          <option key={option} value={option} className="bg-popover text-foreground">
                            {FIELD_NAMES[option]}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((row) => (
                  <tr key={row.index} className="border-b border-border/40 last:border-0">
                    {fields.map((_, index) => (
                      <td key={index} className="max-w-[12rem] truncate p-2 text-muted-foreground">
                        {row.cells[index] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {rows.length} rows{data.hasHeader ? ", after the heading row" : ""}. Guest, Arrive and Rooms are needed.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <FilterPills label="Show rows" options={views.map((option) => ({ ...option, count: option.key === "ready" ? ready.length : option.key === "attention" ? attention.length : rows.length }))} value={view} onChange={setView} />
          <ul className="space-y-2">
            {shown.map((row) => {
              const skipped = row.skipped;
              const problem = row.problems.length > 0;
              return (
                <li
                  key={row.index}
                  className={`animate-rise-in rounded-2xl border p-3 text-sm ${skipped ? "border-border/40 opacity-50" : problem ? "border-amber-400/40 bg-amber-400/5" : "border-border/60"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {!skipped && (problem ? <AlertTriangle className="size-4 text-amber-300" aria-hidden /> : <CheckCircle2 className="size-4 text-emerald-300" aria-hidden />)}
                        {row.guest || "(no name)"}
                        <span className="font-normal text-muted-foreground">
                          · {day(row.arrive)} – {day(row.leave)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.rooms.length ? row.rooms.map((room) => room.name).join(", ") : "No rooms"}
                        {row.rooms.length > 1 ? ` (group of ${row.rooms.length})` : ""} · {row.total !== null ? money(row.total) : "calendar price"} · {paymentWords(row)}
                      </p>
                      {row.problems.map((line) => (
                        <p key={line} className="mt-1 text-xs text-amber-200">
                          {line}
                        </p>
                      ))}
                      {row.warnings.map((line) => (
                        <p key={line} className="mt-1 text-xs text-muted-foreground italic">
                          {line}
                        </p>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!row.duplicateOf && (
                        <button type="button" onClick={() => setFixing(fixing === row.index ? undefined : row.index)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                          Choose rooms
                        </button>
                      )}
                      <label className="inline-flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={skipped}
                          onChange={(event) => {
                            const next = event.target.checked ? [...skip, row.index] : skip.filter((index) => index !== row.index);
                            setSkip(next);
                            refresh({ skip: next });
                          }}
                        />
                        Skip
                      </label>
                    </div>
                  </div>
                  {fixing === row.index && (
                    <div className="mt-3 animate-rise-in rounded-xl bg-secondary/50 p-3">
                      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                        {allRooms.map((room) => {
                          const current = overrides[String(row.index)] ?? row.rooms.map((chosen) => chosen.id);
                          const on = current.includes(room.id);
                          return (
                            <button
                              key={room.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => {
                                const next = { ...overrides, [String(row.index)]: on ? current.filter((id) => id !== room.id) : [...current, room.id] };
                                setOverrides(next);
                                refresh({ overrides: next });
                              }}
                              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-accent bg-accent text-accent-foreground" : "border-border/60 hover:border-accent/60"}`}
                            >
                              {room.name}
                              {properties.length > 1 && <span className="ml-1 opacity-70">· {room.propertyName}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {step === 3 && (
        <DoneStep
          title={failed.length ? `${results.length - failed.length} imported, ${failed.length} didn't` : `${results.length} imported`}
          actions={
            <>
              {failed.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv("forest-creek-import-not-done.csv", [["Row", "Guest", "Why"], ...failed.map((result) => [result.index + 1, result.guest, result.error ?? ""])])}
                  className={buttonClass({ variant: "secondary", shape: "pill" })}
                >
                  Download what didn&rsquo;t import
                </button>
              )}
              <button type="button" onClick={onClose} className={buttonClass({ shape: "pill" })}>
                Done
              </button>
            </>
          }
        >
          {failed.length > 0 ? (
            <ul className="mt-2 space-y-1 text-left text-xs">
              {failed.slice(0, 8).map((result) => (
                <li key={result.index}>
                  <span className="text-foreground">{result.guest}</span>: {result.error}
                </li>
              ))}
            </ul>
          ) : (
            "They're in Bookings now, with their deposits recorded and groups kept together."
          )}
        </DoneStep>
      )}
    </StepModal>
  );
}
