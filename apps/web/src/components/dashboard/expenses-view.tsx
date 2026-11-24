"use client";

import type { AppRouter } from "@forest-creek/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { Download, FileSpreadsheet, Plus, Receipt, Scale, Tags, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { BulkBar } from "./ui/bulk-bar";
import { downloadCsv } from "./ui/csv";
import { DataTable, type Column } from "./ui/data-table";
import { Modal } from "./ui/overlay";
import { FilterPills, PageHeader, Panel, StatTile } from "./ui/page";
import { useIsOwner } from "./use-owner";

type Outputs = inferRouterOutputs<AppRouter>["expenses"];
type Expense = Outputs["list"][number];
type Pnl = Outputs["profitAndLoss"];

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "ecocash", label: "EcoCash" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
] as const;
type Method = (typeof METHODS)[number]["key"];
const methodLabel = (key: string) => METHODS.find((method) => method.key === key)?.label ?? key;

const money = (cents: number) => {
  const figure = (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return `${cents < 0 ? "-" : ""}$${figure}`;
};
const toCents = (dollars: string) => Math.round((Number(dollars.replace(/[$,\s]/g, "")) || 0) * 100);
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const shiftMonth = (month: string, by: number) => {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + number - 1 + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
const dayName = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

type RangeKey = "month" | "last" | "year" | "twelve" | "custom";

function rangeOf(key: Exclude<RangeKey, "custom">): { from: string; to: string } {
  const now = today().slice(0, 7);
  if (key === "month") return { from: now, to: now };
  if (key === "last") return { from: shiftMonth(now, -1), to: shiftMonth(now, -1) };
  if (key === "year") return { from: `${now.slice(0, 4)}-01`, to: now };
  return { from: shiftMonth(now, -11), to: now };
}

const rangeLabel = (range: { from: string; to: string }) => (range.from === range.to ? monthName(range.from) : `${monthName(range.from)} – ${monthName(range.to)}`);

/** Expenses (staff) and the profit & loss (owner): what the lodge spends against what it takes. */
export default function ExpensesView() {
  const isOwner = useIsOwner();
  const { selectedId, properties } = useProperties();
  const [tab, setTab] = useState<"expenses" | "pnl">("expenses");
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [custom, setCustom] = useState(rangeOf("month"));
  const range = rangeKey === "custom" ? custom : rangeOf(rangeKey);
  const [editing, setEditing] = useState<Expense | "new">();
  const [managingCategories, setManagingCategories] = useState(false);

  const propertyName = selectedId ? properties.find((property) => property.id === selectedId)?.name : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenses"
        subtitle={`${propertyName ?? "All properties"} · ${rangeLabel(range)}`}
        actions={
          <>
            <button type="button" onClick={() => setManagingCategories(true)} className={buttonClass({ variant: "secondary", shape: "pill" })}>
              <Tags aria-hidden />
              Categories
            </button>
            <button type="button" onClick={() => setEditing("new")} className={buttonClass({ shape: "pill" })}>
              <Plus aria-hidden />
              Add expense
            </button>
          </>
        }
      />

      {isOwner && (
        <FilterPills
          label="Expenses"
          options={[
            { key: "expenses", label: "Expenses" },
            { key: "pnl", label: "Profit & loss" },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <FilterPills
          label="Period"
          options={[
            { key: "month", label: "This month" },
            { key: "last", label: "Last month" },
            { key: "year", label: "This year" },
            { key: "twelve", label: "Last 12 months" },
            { key: "custom", label: "Choose months" },
          ]}
          value={rangeKey}
          onChange={(key) => {
            if (key === "custom" && rangeKey !== "custom") setCustom(range);
            setRangeKey(key);
          }}
        />
        {rangeKey === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="month" aria-label="From" value={custom.from} max={custom.to} onChange={(event) => event.target.value && setCustom({ ...custom, from: event.target.value })} className={`${inputClass} mt-0 w-auto`} />
            <span className="text-muted-foreground">to</span>
            <input type="month" aria-label="To" value={custom.to} min={custom.from} onChange={(event) => event.target.value && setCustom({ ...custom, to: event.target.value })} className={`${inputClass} mt-0 w-auto`} />
          </div>
        )}
      </div>

      {tab === "pnl" && isOwner ? (
        <ProfitAndLossPanel from={range.from} to={range.to} propertyId={selectedId} />
      ) : (
        <ExpensesPanel from={range.from} to={range.to} propertyId={selectedId} onOpen={setEditing} />
      )}

      {editing && <ExpenseModal expense={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
      {managingCategories && <CategoriesModal onClose={() => setManagingCategories(false)} />}
    </div>
  );
}

function ExpensesPanel({ from, to, propertyId, onOpen }: { from: string; to: string; propertyId?: string; onOpen: (expense: Expense) => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const list = useQuery(trpc.expenses.list.queryOptions({ from, to, propertyId }));
  const categories = useQuery(trpc.expenses.categories.queryOptions());
  const remove = useMutation(trpc.expenses.delete.mutationOptions());

  const rows = useMemo(
    () => list.data?.filter((row) => category === "all" || (category === "none" ? !row.categoryId : row.categoryId === category)),
    [list.data, category],
  );
  const total = (rows ?? []).reduce((sum, row) => sum + row.amountCents, 0);
  const biggest = useMemo(() => {
    const sums = new Map<string, number>();
    for (const row of list.data ?? []) sums.set(row.categoryName ?? "No category", (sums.get(row.categoryName ?? "No category") ?? 0) + row.amountCents);
    return [...sums].sort((a, b) => b[1] - a[1])[0];
  }, [list.data]);

  if (list.isError) return <ErrorMessage title="Expenses didn't load" error={list.error} onRetry={() => void list.refetch()} />;

  const columns: Column<Expense>[] = [
    { key: "day", header: "Date", render: (row) => dayName(row.spentOn), sortValue: (row) => row.spentOn },
    {
      key: "what",
      header: "What for",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.description}</p>
          {row.paidTo && <p className="truncate text-xs text-muted-foreground">{row.paidTo}</p>}
        </div>
      ),
      sortValue: (row) => row.description.toLowerCase(),
    },
    { key: "category", header: "Category", render: (row) => row.categoryName ?? <span className="text-muted-foreground">None</span>, sortValue: (row) => row.categoryName ?? "", hideBelow: "sm" },
    { key: "property", header: "Property", render: (row) => row.propertyName ?? "Whole group", sortValue: (row) => row.propertyName ?? "", hideBelow: "lg" },
    { key: "method", header: "Paid by", render: (row) => methodLabel(row.method), hideBelow: "md" },
    { key: "amount", header: "Amount", align: "right", render: (row) => <span className="font-medium tabular-nums">{money(row.amountCents)}</span>, sortValue: (row) => row.amountCents },
  ];

  const exportCsv = () =>
    downloadCsv(`Forest Creek expenses ${from}${from === to ? "" : ` to ${to}`}.csv`, [
      ["Date", "What for", "Paid to", "Category", "Property", "Paid by", "Reference", "Amount (USD)", "Notes", "Recorded by"],
      ...(rows ?? []).map((row) => [
        row.spentOn,
        row.description,
        row.paidTo ?? "",
        row.categoryName ?? "",
        row.propertyName ?? "Whole group",
        methodLabel(row.method),
        row.reference ?? "",
        (row.amountCents / 100).toFixed(2),
        row.notes ?? "",
        row.createdBy,
      ]),
    ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile tone="clay" icon={Wallet} label="Spent" value={money(total)} hint={category === "all" ? "in this period" : "in this category"} loading={list.isPending} />
        <StatTile tone="gold" icon={Receipt} label="Expenses" value={rows?.length ?? 0} hint="recorded" loading={list.isPending} />
        <StatTile tone="moss" icon={Tags} label="Biggest category" value={biggest ? biggest[0] : "—"} hint={biggest ? money(biggest[1]) : "nothing yet"} loading={list.isPending} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {Boolean(categories.data?.length) && (
          <FilterPills
            label="Category"
            options={[
              { key: "all", label: "All" },
              ...(categories.data ?? [])
                .filter((option) => list.data?.some((row) => row.categoryId === option.id))
                .map((option) => ({ key: option.id, label: option.name })),
              ...(list.data?.some((row) => !row.categoryId) ? [{ key: "none", label: "No category" }] : []),
            ]}
            value={category}
            onChange={setCategory}
          />
        )}
        <button type="button" disabled={!rows?.length} onClick={exportCsv} className={buttonClass({ variant: "secondary", shape: "pill", size: "sm" })}>
          <FileSpreadsheet aria-hidden />
          Spreadsheet
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={onOpen}
        rowLabel={(row) => row.description}
        loading={list.isPending}
        selection={{ selected: picked, onChange: setPicked }}
        empty={<StateMessage icon={Receipt} title="No expenses in this period" description="Add what was spent — groceries, fuel, repairs — and it counts in the profit & loss." />}
      />

      <BulkBar
        count={picked.size}
        noun={["expense", "expenses"]}
        onClear={() => setPicked(new Set())}
        actions={[
          {
            key: "delete",
            label: "Delete",
            icon: Trash2,
            danger: true,
            confirm: `Delete ${picked.size === 1 ? "this expense" : `these ${picked.size} expenses`}? This can't be undone.`,
            onClick: async () => {
              try {
                const result = await remove.mutateAsync([...picked]);
                toast.success(`${result.deleted} deleted${result.skipped ? `, ${result.skipped} not yours to delete` : ""}`);
                setPicked(new Set());
              } catch (error) {
                toast.error(friendlyError(error as Error));
              }
              await queryClient.invalidateQueries({ queryKey: trpc.expenses.pathKey() });
            },
          },
        ]}
      />
    </div>
  );
}

function ExpenseModal({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isOwner = useIsOwner();
  const { properties, selectedId } = useProperties();
  const categories = useQuery(trpc.expenses.categories.queryOptions());
  const [form, setForm] = useState({
    spentOn: expense?.spentOn ?? today(),
    amount: expense ? String(expense.amountCents / 100) : "",
    description: expense?.description ?? "",
    categoryId: expense?.categoryId ?? "",
    propertyId: expense ? (expense.propertyId ?? "") : (selectedId ?? (isOwner ? "" : (properties[0]?.id ?? ""))),
    method: (expense?.method ?? "cash") as Method,
    paidTo: expense?.paidTo ?? "",
    reference: expense?.reference ?? "",
    notes: expense?.notes ?? "",
  });
  const [more, setMore] = useState(Boolean(expense?.reference || expense?.notes));
  const [newCategory, setNewCategory] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const set = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setProblem(undefined);
  };

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.expenses.pathKey() });
    onClose();
  };
  const create = useMutation(trpc.expenses.create.mutationOptions({ onSuccess: () => { toast.success("Expense added"); return done(); }, onError: (error) => setProblem(friendlyError(error)) }));
  const update = useMutation(trpc.expenses.update.mutationOptions({ onSuccess: () => { toast.success("Expense saved"); return done(); }, onError: (error) => setProblem(friendlyError(error)) }));
  const remove = useMutation(trpc.expenses.delete.mutationOptions({ onSuccess: () => { toast.success("Expense deleted"); return done(); }, onError: (error) => setProblem(friendlyError(error)) }));
  const addCategory = useMutation(
    trpc.expenses.addCategory.mutationOptions({
      onSuccess: async (category) => {
        await queryClient.invalidateQueries({ queryKey: trpc.expenses.categories.queryKey() });
        set({ categoryId: category.id });
        setNewCategory(undefined);
      },
      onError: (error) => setProblem(friendlyError(error)),
    }),
  );
  const pending = create.isPending || update.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amountCents = toCents(form.amount);
    if (!form.description.trim()) return setProblem("Say what it was for.");
    if (amountCents <= 0) return setProblem("Enter the amount.");
    if (!isOwner && !form.propertyId) return setProblem("Choose the property.");
    const data = {
      spentOn: form.spentOn,
      amountCents,
      description: form.description,
      categoryId: form.categoryId || null,
      propertyId: form.propertyId || null,
      method: form.method,
      paidTo: form.paidTo.trim() || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (expense) update.mutate({ id: expense.id, ...data });
    else create.mutate(data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<Receipt className="size-4" />}
      title={expense ? "Expense" : "Add an expense"}
      description={expense ? `Recorded by ${expense.createdBy}` : "What was paid, when, and what for."}
      footer={
        <>
          {expense && (
            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate([expense.id])} className={`${buttonClass({ variant: "ghost", shape: "pill" })} mr-auto text-destructive`}>
              <Trash2 aria-hidden />
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className={buttonClass({ variant: "secondary", shape: "pill" })}>
            Cancel
          </button>
          <button type="submit" form="expense-form" disabled={pending} className={buttonClass({ shape: "pill" })}>
            {pending && <Spinner />}
            {expense ? "Save" : "Add expense"}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Amount (USD)
          <input inputMode="decimal" autoFocus={!expense} value={form.amount} onChange={(event) => set({ amount: event.target.value })} placeholder="0.00" className={inputClass} />
        </label>
        <label className="block text-sm">
          Paid on
          <input type="date" value={form.spentOn} max={today()} onChange={(event) => set({ spentOn: event.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm sm:col-span-2">
          What for
          <input value={form.description} onChange={(event) => set({ description: event.target.value })} placeholder="Diesel for the generator, vegetables from Sakubva…" className={inputClass} />
        </label>
        <div className="block text-sm">
          <label htmlFor="expense-category">Category</label>
          {newCategory === undefined ? (
            <select
              id="expense-category"
              value={form.categoryId}
              onChange={(event) => (event.target.value === "+new" ? setNewCategory("") : set({ categoryId: event.target.value }))}
              className={inputClass}
            >
              <option value="">No category</option>
              {categories.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value="+new">+ New category…</option>
            </select>
          ) : (
            <div className="mt-1 flex gap-2">
              <input
                id="expense-category"
                autoFocus
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (newCategory.trim()) addCategory.mutate(newCategory);
                  }
                }}
                placeholder="New category"
                className={`${inputClass} mt-0`}
              />
              <button type="button" disabled={!newCategory.trim() || addCategory.isPending} onClick={() => addCategory.mutate(newCategory)} className={buttonClass({ size: "sm" })}>
                Add
              </button>
            </div>
          )}
        </div>
        <label className="block text-sm">
          Paid by
          <select value={form.method} onChange={(event) => set({ method: event.target.value as Method })} className={inputClass}>
            {METHODS.map((method) => (
              <option key={method.key} value={method.key}>
                {method.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Paid to <span className="text-muted-foreground">(optional)</span>
          <input value={form.paidTo} onChange={(event) => set({ paidTo: event.target.value })} placeholder="Shop or person" className={inputClass} />
        </label>
        {(properties.length > 1 || isOwner) && (
          <label className="block text-sm">
            Property
            <select value={form.propertyId} onChange={(event) => set({ propertyId: event.target.value })} className={inputClass}>
              {isOwner ? <option value="">Whole group</option> : <option value="">Choose…</option>}
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {more ? (
          <>
            <label className="block text-sm">
              Reference <span className="text-muted-foreground">(slip or invoice no.)</span>
              <input value={form.reference} onChange={(event) => set({ reference: event.target.value })} className={inputClass} />
            </label>
            <label className="block text-sm sm:col-span-2">
              Notes
              <textarea rows={2} value={form.notes} onChange={(event) => set({ notes: event.target.value })} className={inputClass} />
            </label>
          </>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="justify-self-start text-sm text-accent hover:underline sm:col-span-2">
            + Reference or notes
          </button>
        )}
        {problem && <p className="text-sm text-destructive sm:col-span-2">{problem}</p>}
      </form>
    </Modal>
  );
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const isOwner = useIsOwner();
  const categories = useQuery(trpc.expenses.categories.queryOptions());
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string }>();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.expenses.pathKey() });
  const failed = (error: { message?: string }) => toast.error(friendlyError(error));
  const add = useMutation(trpc.expenses.addCategory.mutationOptions({ onSuccess: async () => { setName(""); await refresh(); }, onError: failed }));
  const rename = useMutation(trpc.expenses.renameCategory.mutationOptions({ onSuccess: async () => { setRenaming(undefined); await refresh(); }, onError: failed }));
  const remove = useMutation(trpc.expenses.deleteCategory.mutationOptions({ onSuccess: () => void refresh(), onError: failed }));

  return (
    <Modal open onClose={onClose} size="md" icon={<Tags className="size-4" />} title="Expense categories" description="Group what is spent, for the totals and the profit & loss.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) add.mutate(name);
        }}
        className="flex gap-2"
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Generator fuel, Staff meals…" aria-label="New category" className={`${inputClass} mt-0`} />
        <button type="submit" disabled={!name.trim() || add.isPending} className={buttonClass({ shape: "pill" })}>
          {add.isPending ? <Spinner /> : <Plus aria-hidden />}
          Add
        </button>
      </form>
      {categories.isPending && <Skeleton className="mt-4 h-24 w-full rounded-xl" />}
      <ul className="mt-4 divide-y divide-border/50">
        {categories.data?.map((category) => (
          <li key={category.id} className="flex items-center gap-2 py-2 text-sm">
            {renaming?.id === category.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (renaming.name.trim()) rename.mutate(renaming);
                }}
                className="flex flex-1 gap-2"
              >
                <input autoFocus value={renaming.name} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })} aria-label="Category name" className={`${inputClass} mt-0`} />
                <button type="submit" disabled={rename.isPending} className={buttonClass({ size: "sm" })}>
                  Save
                </button>
                <button type="button" onClick={() => setRenaming(undefined)} className={buttonClass({ size: "sm", variant: "ghost" })}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1">
                  {category.name} <span className="text-muted-foreground">· {category.expenses} {category.expenses === 1 ? "expense" : "expenses"}</span>
                </span>
                {isOwner && (
                  <>
                    <button type="button" onClick={() => setRenaming({ id: category.id, name: category.name })} className={buttonClass({ size: "sm", variant: "ghost" })}>
                      Rename
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${category.name}? Its expenses stay, with no category.`)) remove.mutate(category.id);
                      }}
                      className={buttonClass({ size: "sm", variant: "ghost" })}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function ProfitAndLossPanel({ from, to, propertyId }: { from: string; to: string; propertyId?: string }) {
  const pnl = useQuery(trpc.expenses.profitAndLoss.queryOptions({ from, to, propertyId }));
  if (pnl.isError) return <ErrorMessage title="The profit & loss didn't load" error={pnl.error} onRetry={() => void pnl.refetch()} />;
  const data = pnl.data;
  const total = data?.total;
  const query = new URLSearchParams({ from, to, ...(propertyId ? { propertyId } : {}) });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile tone="moss" icon={TrendingUp} label="Money in" value={money(total?.moneyIn ?? 0)} hint="booking payments and paid invoices" loading={pnl.isPending} />
        <StatTile tone="clay" icon={TrendingDown} label="Money out" value={money(total?.moneyOut ?? 0)} hint="expenses, wages and refunds" loading={pnl.isPending} />
        <StatTile
          tone="gold"
          icon={Scale}
          label={(total?.profit ?? 0) < 0 ? "Loss" : "Profit"}
          value={money(total?.profit ?? 0)}
          hint={total?.margin == null ? "nothing came in" : `${Math.round(total.margin * 100)}% of money in`}
          loading={pnl.isPending}
        />
      </div>

      <Panel
        title="Month by month"
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/dashboard/expenses/pnl/pdf?${query}`} className={buttonClass({ variant: "secondary", shape: "pill", size: "sm" })}>
              <Download aria-hidden />
              PDF
            </a>
            <button type="button" disabled={!data} onClick={() => data && downloadCsv(`Forest Creek profit and loss ${from} to ${to}.csv`, pnlSpreadsheet(data))} className={buttonClass({ variant: "secondary", shape: "pill", size: "sm" })}>
              <FileSpreadsheet aria-hidden />
              Spreadsheet
            </button>
          </div>
        }
      >
        {!data ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">Month</th>
                  <th className="py-2 pr-3 text-right font-normal">Bookings</th>
                  <th className="py-2 pr-3 text-right font-normal">Invoices</th>
                  <th className="py-2 pr-3 text-right font-normal">Expenses</th>
                  <th className="py-2 pr-3 text-right font-normal">Wages</th>
                  <th className="py-2 pr-3 text-right font-normal">Refunds</th>
                  <th className="py-2 text-right font-normal">Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => (
                  <tr key={row.month} className="border-b border-border/40">
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="py-2 pr-3 text-right">{money(row.bookings)}</td>
                    <td className="py-2 pr-3 text-right">{money(row.invoices)}</td>
                    <td className="py-2 pr-3 text-right">{money(row.expenses)}</td>
                    <td className="py-2 pr-3 text-right">{money(row.wages)}</td>
                    <td className="py-2 pr-3 text-right">{money(row.refunds)}</td>
                    <td className={`py-2 text-right font-medium ${row.profit < 0 ? "text-rose-300" : ""}`}>{money(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
              {data.months.length > 1 && (
                <tfoot>
                  <tr className="font-medium">
                    <td className="py-2.5 pr-3">Total</td>
                    <td className="py-2.5 pr-3 text-right">{money(data.total.bookings)}</td>
                    <td className="py-2.5 pr-3 text-right">{money(data.total.invoices)}</td>
                    <td className="py-2.5 pr-3 text-right">{money(data.total.expenses)}</td>
                    <td className="py-2.5 pr-3 text-right">{money(data.total.wages)}</td>
                    <td className="py-2.5 pr-3 text-right">{money(data.total.refunds)}</td>
                    <td className={`py-2.5 text-right ${data.total.profit < 0 ? "text-rose-300" : ""}`}>{money(data.total.profit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Money as it came in and went out. A stay paid on arrival counts when it is paid; unpaid bookings don&apos;t count.{" "}
          {propertyId ? "Costs for the whole group are only in the all-properties view." : ""}
        </p>
      </Panel>

      {data && data.expensesByCategory.length > 0 && (
        <Panel title="Where the money went">
          <ul className="space-y-3">
            {data.expensesByCategory.map((row) => (
              <li key={row.category} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{row.category}</span>
                  <span className="tabular-nums">
                    {money(row.cents)} <span className="text-xs text-muted-foreground">· {Math.round(row.share * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, row.share * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function pnlSpreadsheet(data: Pnl): (string | number)[][] {
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const line = (label: string, row: Pnl["total"]) => [label, dollars(row.bookings), dollars(row.invoices), dollars(row.moneyIn), dollars(row.expenses), dollars(row.wages), dollars(row.refunds), dollars(row.moneyOut), dollars(row.profit)];
  return [
    ["Month", "Booking payments", "Paid invoices", "Money in", "Expenses", "Wages", "Refunds", "Money out", "Profit"],
    ...data.months.map((row) => line(row.label, row)),
    line("Total", data.total),
    [],
    ["Expenses by category", "Amount (USD)", "Share"],
    ...data.expensesByCategory.map((row) => [row.category, dollars(row.cents), `${Math.round(row.share * 100)}%`]),
  ];
}
