"use client";

import type { AppRouter } from "@forest-creek/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckCircle2, Download, PenLine, Plus, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { BulkBar } from "./ui/bulk-bar";
import { DataTable, type Column } from "./ui/data-table";
import { Drawer, Modal } from "./ui/overlay";
import { FilterPills, PageHeader, StatTile, StatusChip } from "./ui/page";
import { SignaturePad } from "./ui/signature-pad";
import { DoneStep, StepModal } from "./ui/steps";

type Outputs = inferRouterOutputs<AppRouter>["payroll"];
type Employee = Outputs["employees"][number];
type RunRow = Outputs["runs"][number];
type Slip = Outputs["run"]["payslips"][number];

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "ecocash", label: "EcoCash" },
] as const;
type Method = (typeof METHODS)[number]["key"];

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);
const toDollars = (cents: number) => (cents ? String(cents / 100) : "");
const periodLabel = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
const thisMonth = () => new Date().toISOString().slice(0, 7);

const STATE_CHIPS = { due: { label: "Due", tone: "gold" }, paid: { label: "Paid", tone: "info" }, signed: { label: "Signed", tone: "good" } } as const;

/** Payroll, owner only: the people, and each month's pay run. */
export default function PayrollView() {
  const [tab, setTab] = useState<"runs" | "people">("runs");
  const runs = useQuery(trpc.payroll.runs.queryOptions());
  const people = useQuery(trpc.payroll.employees.queryOptions({ includeInactive: true }));
  const [building, setBuilding] = useState(false);
  const [openRun, setOpenRun] = useState<string>();
  const [editing, setEditing] = useState<Employee | "new">();

  if (runs.isError) {
    return (
      <div className="space-y-5">
        <PageHeader title="Payroll" />
        <ErrorMessage title="Payroll is for the owner" error={runs.error} onRetry={() => void runs.refetch()} />
      </div>
    );
  }

  const active = (people.data ?? []).filter((person) => person.active);
  const monthlyCents = active.reduce((sum, person) => sum + person.baseSalaryCents, 0);
  const due = (runs.data ?? []).reduce((sum, run) => sum + (run.people - run.paid), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payroll"
        subtitle="Owner only"
        actions={
          tab === "runs" ? (
            <button type="button" disabled={active.length === 0} onClick={() => setBuilding(true)} className={buttonClass({ shape: "pill" })}>
              <Plus aria-hidden />
              New pay run
            </button>
          ) : (
            <button type="button" onClick={() => setEditing("new")} className={buttonClass({ shape: "pill" })}>
              <UserPlus aria-hidden />
              Add employee
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile tone="gold" icon={Users} label="Employees" value={active.length} hint="working here now" loading={people.isPending} />
        <StatTile tone="clay" icon={Wallet} label="Monthly pay" value={money(monthlyCents)} hint="basic, before allowances" loading={people.isPending} />
        <StatTile tone="moss" icon={CheckCircle2} label="Still to pay" value={due} hint={due === 1 ? "payslip" : "payslips"} loading={runs.isPending} />
      </div>

      <FilterPills
        label="Payroll"
        options={[
          { key: "runs", label: "Pay runs" },
          { key: "people", label: "Employees" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "runs" ? (
        <RunsTable rows={runs.data} loading={runs.isPending} onOpen={setOpenRun} />
      ) : (
        <PeopleTable rows={people.data} loading={people.isPending} onOpen={setEditing} />
      )}

      <RunDrawer runId={openRun} onClose={() => setOpenRun(undefined)} />
      {editing && <EmployeeModal employee={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
      {building && (
        <PayRunWizard
          employees={active}
          onClose={() => setBuilding(false)}
          onCreated={(id) => {
            setBuilding(false);
            setOpenRun(id);
          }}
        />
      )}
    </div>
  );
}

function RunsTable({ rows, loading, onOpen }: { rows?: RunRow[]; loading: boolean; onOpen: (id: string) => void }) {
  const columns: Column<RunRow>[] = [
    {
      key: "period",
      header: "Month",
      sortValue: (row) => row.period,
      render: (row) => (
        <span className="block">
          <span className="block font-medium">{periodLabel(row.period)}</span>
          <span className="block font-mono text-xs text-accent">{row.label}</span>
        </span>
      ),
    },
    { key: "people", header: "People", render: (row) => row.people },
    {
      key: "progress",
      header: "Paid · signed",
      hideBelow: "sm",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.paid}/{row.people} · {row.signed}/{row.people}
        </span>
      ),
    },
    { key: "total", header: "Net total", align: "right", sortValue: (row) => row.totalCents, render: (row) => <span className="font-medium">{money(row.totalCents)}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={(row) => onOpen(row.id)}
      rowLabel={(row) => row.label}
      loading={loading}
      empty={<StateMessage icon={Wallet} title="No pay runs yet" description="Add the employees, then make a pay run for the month. Each person signs on the screen when paid." />}
    />
  );
}

function PeopleTable({ rows, loading, onOpen }: { rows?: Employee[]; loading: boolean; onOpen: (employee: Employee) => void }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const remove = useMutation(trpc.payroll.deleteEmployee.mutationOptions());
  const update = useMutation(trpc.payroll.updateEmployee.mutationOptions());
  const chosen = (rows ?? []).filter((row) => picked.has(row.id));

  async function each(run: (employee: Employee) => Promise<unknown>, done: string) {
    let ok = 0;
    const errors: string[] = [];
    for (const employee of chosen) {
      try {
        await run(employee);
        ok++;
      } catch (error) {
        errors.push(friendlyError(error as Error));
      }
    }
    if (ok) toast.success(`${ok} ${done}`);
    if (errors.length) toast.warning(errors[0]!);
    setPicked(new Set());
    await queryClient.invalidateQueries({ queryKey: trpc.payroll.pathKey() });
  }

  const asInput = (employee: Employee, active: boolean) => ({
    id: employee.id,
    employee: {
      name: employee.name,
      position: employee.position ?? undefined,
      idNumber: employee.idNumber ?? undefined,
      phone: employee.phone ?? undefined,
      email: employee.email ?? "",
      propertyId: employee.propertyId,
      startDate: employee.startDate ? String(employee.startDate).slice(0, 10) : undefined,
      baseSalaryCents: employee.baseSalaryCents,
      paymentMethod: employee.paymentMethod as Method,
      paymentDetails: employee.paymentDetails ?? undefined,
      notes: employee.notes ?? undefined,
      active,
    },
  });

  const columns: Column<Employee>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => (
        <span className="block">
          <span className="block font-medium">{row.name}</span>
          <span className="block text-xs text-muted-foreground">{row.position ?? "—"}</span>
        </span>
      ),
    },
    { key: "where", header: "Works at", hideBelow: "md", render: (row) => <span className="text-muted-foreground">{row.property?.name ?? "All properties"}</span> },
    { key: "paid", header: "Paid by", hideBelow: "sm", render: (row) => <span className="text-muted-foreground">{METHODS.find((method) => method.key === row.paymentMethod)?.label}</span> },
    { key: "status", header: "Status", render: (row) => <StatusChip tone={row.active ? "good" : "neutral"}>{row.active ? "Working" : "Left"}</StatusChip> },
    { key: "pay", header: "Monthly pay", align: "right", sortValue: (row) => row.baseSalaryCents, render: (row) => money(row.baseSalaryCents) },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={onOpen}
        rowLabel={(row) => row.name}
        loading={loading}
        selection={{ selected: picked, onChange: setPicked }}
        empty={<StateMessage icon={Users} title="No employees yet" description="Add each person once: their position, how they're paid and their usual monthly pay." />}
      />
      <BulkBar
        count={picked.size}
        noun={["employee", "employees"]}
        onClear={() => setPicked(new Set())}
        actions={[
          { key: "left", label: "Mark as left", onClick: () => each((employee) => update.mutateAsync(asInput(employee, false)), "marked as left") },
          { key: "back", label: "Working again", onClick: () => each((employee) => update.mutateAsync(asInput(employee, true)), "working again") },
          { key: "delete", label: "Delete", icon: Trash2, danger: true, confirm: "Delete? Only people never paid can be deleted.", onClick: () => each((employee) => remove.mutateAsync(employee.id), "deleted") },
        ]}
      />
    </>
  );
}

function EmployeeModal({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { properties } = useProperties();
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    position: employee?.position ?? "",
    idNumber: employee?.idNumber ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    propertyId: employee?.propertyId ?? "",
    startDate: employee?.startDate ? String(employee.startDate).slice(0, 10) : "",
    salary: toDollars(employee?.baseSalaryCents ?? 0),
    paymentMethod: (employee?.paymentMethod ?? "cash") as Method,
    paymentDetails: employee?.paymentDetails ?? "",
    notes: employee?.notes ?? "",
    active: employee?.active ?? true,
  });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const options = {
    onSuccess: async () => {
      toast.success(employee ? "Saved" : `${form.name} added`);
      await queryClient.invalidateQueries({ queryKey: trpc.payroll.pathKey() });
      onClose();
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  };
  const add = useMutation(trpc.payroll.addEmployee.mutationOptions(options));
  const update = useMutation(trpc.payroll.updateEmployee.mutationOptions(options));
  const pending = add.isPending || update.isPending;

  function save(event: React.FormEvent) {
    event.preventDefault();
    const data = {
      name: form.name,
      position: form.position || undefined,
      idNumber: form.idNumber || undefined,
      phone: form.phone || undefined,
      email: form.email,
      propertyId: form.propertyId || null,
      startDate: form.startDate || undefined,
      baseSalaryCents: toCents(form.salary),
      paymentMethod: form.paymentMethod,
      paymentDetails: form.paymentDetails || undefined,
      notes: form.notes || undefined,
      active: form.active,
    };
    if (employee) update.mutate({ id: employee.id, employee: data });
    else add.mutate(data);
  }

  const field = (label: string, key: keyof typeof form, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-xs">
      {label}
      <input value={String(form[key])} onChange={(event) => set({ [key]: event.target.value } as Partial<typeof form>)} className={inputClass} {...extra} />
    </label>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<UserPlus className="size-4" />}
      title={employee ? `Edit ${employee.name}` : "Add employee"}
      footer={
        <button type="submit" form="employee-form" disabled={pending || !form.name.trim()} className={buttonClass({ shape: "pill" })}>
          {pending && <Spinner />}
          {employee ? "Save" : "Add employee"}
        </button>
      }
    >
      <form id="employee-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {field("Name", "name", { required: true, autoFocus: true })}
        {field("Position", "position", { placeholder: "Housekeeper" })}
        {field("Monthly pay (USD)", "salary", { type: "number", min: 0, step: "0.01" })}
        <label className="text-xs">
          Works at
          <select value={form.propertyId} onChange={(event) => set({ propertyId: event.target.value })} className={inputClass}>
            <option value="" className="bg-popover">
              All properties
            </option>
            {properties.map((property) => (
              <option key={property.id} value={property.id} className="bg-popover">
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-xs">Paid by</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {METHODS.map((method) => (
              <button
                key={method.key}
                type="button"
                aria-pressed={form.paymentMethod === method.key}
                onClick={() => set({ paymentMethod: method.key })}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${form.paymentMethod === method.key ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </fieldset>
        {form.paymentMethod !== "cash" && field(form.paymentMethod === "ecocash" ? "EcoCash number" : "Bank and account", "paymentDetails")}
        {field("ID no.", "idNumber", { autoComplete: "off" })}
        {field("Phone", "phone")}
        {field("Started", "startDate", { type: "date" })}
        {employee && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.active} onChange={(event) => set({ active: event.target.checked })} />
            Still working here
          </label>
        )}
      </form>
    </Modal>
  );
}

const wizardSteps = [
  { key: "month", label: "Month" },
  { key: "pay", label: "Pay" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
] as const;

type Line = { employeeId: string; name: string; include: boolean; basic: string; allowances: string; overtime: string; deductions: string; deductionNote: string; method: Method };

/** A month's pay in four steps: which month, each person's pay (their usual pay filled in), a last look, done. */
function PayRunWizard({ employees, onClose, onCreated }: { employees: Employee[]; onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [period, setPeriod] = useState(thisMonth());
  const [lines, setLines] = useState<Line[]>(
    employees.map((employee) => ({
      employeeId: employee.id,
      name: employee.name,
      include: true,
      basic: toDollars(employee.baseSalaryCents),
      allowances: "",
      overtime: "",
      deductions: "",
      deductionNote: "",
      method: employee.paymentMethod as Method,
    })),
  );
  const patch = (id: string, change: Partial<Line>) => setLines((current) => current.map((line) => (line.employeeId === id ? { ...line, ...change } : line)));
  const net = (line: Line) => Math.max(0, toCents(line.basic) + toCents(line.allowances) + toCents(line.overtime) - toCents(line.deductions));
  const included = lines.filter((line) => line.include);
  const total = included.reduce((sum, line) => sum + net(line), 0);

  const create = useMutation(
    trpc.payroll.createRun.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.payroll.pathKey() });
        setStep(3);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const next =
    step === 0
      ? { label: "Next", onClick: () => setStep(1), disabled: !/^\d{4}-\d{2}$/.test(period) }
      : step === 1
        ? { label: "Review", onClick: () => setStep(2), disabled: included.length === 0 }
        : step === 2
          ? {
              label: `Make the pay run (${money(total)})`,
              pending: create.isPending,
              onClick: () =>
                create.mutate({
                  period,
                  slips: included.map((line) => ({
                    employeeId: line.employeeId,
                    basicCents: toCents(line.basic),
                    allowancesCents: toCents(line.allowances),
                    overtimeCents: toCents(line.overtime),
                    deductionsCents: toCents(line.deductions),
                    deductionNote: line.deductionNote || undefined,
                    method: line.method,
                  })),
                }),
            }
          : undefined;

  const small = "w-full rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm";

  return (
    <StepModal
      title="New pay run"
      description="Everyone's usual pay is filled in: change only what's different this month."
      icon={<Wallet className="size-4" />}
      size={step === 1 ? "xl" : "md"}
      steps={wizardSteps}
      current={step}
      onClose={onClose}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={step >= 1 && step < 3 ? <span>{included.length} people · <span className="font-display text-xl">{money(total)}</span></span> : undefined}
    >
      {step === 0 && (
        <label className="block text-xs">
          The month being paid
          <input type="month" autoFocus value={period} onChange={(event) => setPeriod(event.target.value)} className={inputClass} />
        </label>
      )}

      {step === 1 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-normal">Person</th>
                <th className="pb-2 font-normal">Basic</th>
                <th className="pb-2 font-normal">Allowances</th>
                <th className="pb-2 font-normal">Overtime</th>
                <th className="pb-2 font-normal">Deductions</th>
                <th className="pb-2 font-normal">Paid by</th>
                <th className="pb-2 text-right font-normal">Net</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.employeeId} className={`border-t border-border/40 align-top ${line.include ? "" : "opacity-40"}`}>
                  <td className="py-2 pr-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={line.include} onChange={(event) => patch(line.employeeId, { include: event.target.checked })} />
                      {line.name}
                    </label>
                  </td>
                  {(["basic", "allowances", "overtime"] as const).map((key) => (
                    <td key={key} className="py-2 pr-2">
                      <input type="number" min={0} step="0.01" value={line[key]} onChange={(event) => patch(line.employeeId, { [key]: event.target.value })} className={small} />
                    </td>
                  ))}
                  <td className="py-2 pr-2">
                    <input type="number" min={0} step="0.01" value={line.deductions} onChange={(event) => patch(line.employeeId, { deductions: event.target.value })} className={small} />
                    {Number(line.deductions) > 0 && (
                      <input value={line.deductionNote} onChange={(event) => patch(line.employeeId, { deductionNote: event.target.value })} placeholder="What for" className={`${small} mt-1`} />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <select value={line.method} onChange={(event) => patch(line.employeeId, { method: event.target.value as Method })} className={small}>
                      {METHODS.map((method) => (
                        <option key={method.key} value={method.key} className="bg-popover">
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right font-medium">{money(net(line))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 text-sm">
          <p className="font-display text-xl">{periodLabel(period)}</p>
          <ul className="divide-y divide-border/40 rounded-2xl bg-secondary/40 px-4">
            {METHODS.map((method) => {
              const by = included.filter((line) => line.method === method.key);
              if (!by.length) return null;
              return (
                <li key={method.key} className="flex justify-between py-2.5">
                  <span>
                    {method.label} · {by.length} {by.length === 1 ? "person" : "people"}
                  </span>
                  <span className="font-medium">{money(by.reduce((sum, line) => sum + net(line), 0))}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground">Nothing is marked paid yet: you do that as each person is paid, and they sign for it.</p>
        </div>
      )}

      {step === 3 && create.data && (
        <DoneStep
          title="Pay run ready"
          actions={
            <button type="button" onClick={() => onCreated(create.data!.id)} className={buttonClass({ shape: "pill" })}>
              Open it to pay and sign
            </button>
          }
        >
          {included.length} payslips for {periodLabel(period)}, {money(total)} in all.
        </DoneStep>
      )}
    </StepModal>
  );
}

/** One pay run: each payslip, marked paid as it is handed over, then signed for. */
function RunDrawer({ runId, onClose }: { runId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const run = useQuery({ ...trpc.payroll.run.queryOptions(runId ?? ""), enabled: Boolean(runId) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [signing, setSigning] = useState<Slip>();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.payroll.pathKey() });
  const failed = (error: { message?: string }) => toast.error(friendlyError(error));
  const markPaid = useMutation(trpc.payroll.markPaid.mutationOptions({ onError: failed }));
  const unmark = useMutation(trpc.payroll.unmarkPaid.mutationOptions({ onSuccess: () => void refresh(), onError: failed }));
  const remove = useMutation(
    trpc.payroll.deleteRun.mutationOptions({
      onSuccess: async () => {
        toast.success("Pay run deleted");
        onClose();
        await refresh();
      },
      onError: failed,
    }),
  );
  const data = run.data;
  const slips = data?.payslips ?? [];

  const columns: Column<Slip>[] = [
    {
      key: "name",
      header: "Person",
      sortValue: (slip) => slip.employeeName.toLowerCase(),
      render: (slip) => (
        <span className="block">
          <span className="block font-medium">{slip.employeeName}</span>
          <span className="block text-xs text-muted-foreground">{slip.position ?? ""}</span>
        </span>
      ),
    },
    { key: "state", header: "Status", render: (slip) => <StatusChip tone={STATE_CHIPS[slip.state].tone}>{STATE_CHIPS[slip.state].label}</StatusChip> },
    { key: "net", header: "Net", align: "right", sortValue: (slip) => slip.netCents, render: (slip) => <span className="font-medium">{money(slip.netCents)}</span> },
    {
      key: "do",
      header: "",
      align: "right",
      render: (slip) => (
        <span className="inline-flex gap-1" onClick={(event) => event.stopPropagation()}>
          {slip.state === "due" && (
            <button type="button" onClick={() => markPaid.mutate({ ids: [slip.id] }, { onSuccess: () => void refresh() })} className={buttonClass({ size: "sm", variant: "secondary" })}>
              Paid
            </button>
          )}
          {slip.state === "paid" && (
            <>
              <button type="button" onClick={() => setSigning(slip)} className={buttonClass({ size: "sm" })}>
                <PenLine aria-hidden />
                Sign
              </button>
              <button type="button" onClick={() => unmark.mutate(slip.id)} className={buttonClass({ size: "sm", variant: "ghost" })}>
                Undo
              </button>
            </>
          )}
          <a href={`/dashboard/payroll/payslips/${slip.id}/pdf`} aria-label={`Payslip for ${slip.employeeName}`} className={buttonClass({ size: "sm", variant: "ghost" })}>
            <Download aria-hidden />
          </a>
        </span>
      ),
    },
  ];

  const ids = [...picked];

  return (
    <Drawer open={Boolean(runId)} onClose={onClose} title={data ? periodLabel(data.period) : "Pay run"} description={data ? <span className="font-mono tracking-wider text-accent">{data.label}</span> : undefined}>
      {run.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}
      {run.isError && <ErrorMessage title="This pay run didn't load" error={run.error} onRetry={() => void run.refetch()} />}
      {data && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {slips.length} people · {money(slips.reduce((sum, slip) => sum + slip.netCents, 0))} · {slips.filter((slip) => slip.paidAt).length} paid ·{" "}
            {slips.filter((slip) => slip.signedAt).length} signed
          </p>
          <DataTable columns={columns} rows={slips} rowKey={(slip) => slip.id} rowLabel={(slip) => slip.employeeName} selection={{ selected: picked, onChange: setPicked }} empty={<span />} />
          {slips.every((slip) => !slip.paidAt) && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Delete this pay run? Nobody on it has been paid.")) remove.mutate(data.id);
              }}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              <Trash2 aria-hidden />
              Delete pay run
            </button>
          )}
        </div>
      )}
      <BulkBar
        count={picked.size}
        noun={["payslip", "payslips"]}
        onClear={() => setPicked(new Set())}
        actions={[
          {
            key: "paid",
            label: "Mark paid",
            icon: CheckCircle2,
            onClick: () =>
              markPaid.mutateAsync({ ids }).then(async ({ changed }) => {
                toast.success(`${changed} marked paid`);
                setPicked(new Set());
                await refresh();
              }),
          },
          {
            key: "download",
            label: "Download payslips",
            icon: Download,
            onClick: () => window.location.assign(ids.length === 1 ? `/dashboard/payroll/payslips/${ids[0]}/pdf` : `/dashboard/documents/zip?kind=payslip&ids=${ids.join(",")}`),
          },
        ]}
      />
      {signing && data && <SignModal slip={signing} period={data.period} onClose={() => setSigning(undefined)} onSigned={() => void refresh()} />}
    </Drawer>
  );
}

/** The employee signs on the screen for the pay they have just received. */
function SignModal({ slip, period, onClose, onSigned }: { slip: Slip; period: string; onClose: () => void; onSigned: () => void }) {
  const [signature, setSignature] = useState<string>();
  const sign = useMutation(
    trpc.payroll.sign.mutationOptions({
      onSuccess: () => {
        toast.success(`${slip.employeeName} has signed`);
        onSigned();
        onClose();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<PenLine className="size-4" />}
      title={`${slip.employeeName} signs`}
      description="Hand the screen to them."
      footer={
        <button type="button" disabled={!signature || sign.isPending} onClick={() => signature && sign.mutate({ id: slip.id, signature })} className={buttonClass({ shape: "pill" })}>
          {sign.isPending && <Spinner />}
          Sign for my pay
        </button>
      }
    >
      <p className="mb-3 rounded-2xl bg-secondary/50 px-4 py-3 text-sm">
        I, <span className="font-medium">{slip.employeeName}</span>, have received <span className="font-medium">{money(slip.netCents)}</span>, my net pay for {periodLabel(period)}.
      </p>
      <SignaturePad hint={`${slip.employeeName} signs here`} onChange={setSignature} />
    </Modal>
  );
}
