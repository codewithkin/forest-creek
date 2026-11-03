"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { DataTable, type Column } from "./ui/data-table";
import { Modal } from "./ui/overlay";
import { PageHeader, Panel, StatusChip } from "./ui/page";
import { ChoiceCard, DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

type Person = { id: string; name: string; email: string; role: "admin" | "manager"; propertyIds: string[]; lastSeen: string | null; createdAt: string };

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The owner's settings: who can sign in, and starting over. */
export default function SettingsView() {
  const people = useQuery(trpc.admin.people.queryOptions());
  const { properties } = useProperties();
  const [editing, setEditing] = useState<Person | "new">();
  const [erasing, setErasing] = useState(false);
  const names = new Map(properties.map((property) => [property.id, property.name]));

  if (people.isError) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" />
        <ErrorMessage title="Settings are for the owner" error={people.error} onRetry={() => void people.refetch()} />
      </div>
    );
  }

  const columns: Column<Person>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (person) => person.name.toLowerCase(),
      render: (person) => (
        <span className="block min-w-0">
          <span className="block font-medium">
            {person.name}
            {person.id === people.data?.me && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (person) => <StatusChip tone={person.role === "admin" ? "gold" : "info"}>{person.role === "admin" ? "Owner" : "Manager"}</StatusChip>,
    },
    {
      key: "properties",
      header: "Properties",
      hideBelow: "md",
      render: (person) => (
        <span className="text-muted-foreground">
          {person.role === "admin" ? "All" : person.propertyIds.map((id) => names.get(id) ?? "—").join(", ") || "None yet"}
        </span>
      ),
    },
    { key: "seen", header: "Last signed in", align: "right", hideBelow: "lg", render: (person) => <span className="text-muted-foreground">{person.lastSeen ? day(person.lastSeen) : "Never"}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Owner only" />

      <Panel
        title="People"
        action={
          <button type="button" onClick={() => setEditing("new")} className={buttonClass({ shape: "pill", size: "sm" })}>
            <UserPlus aria-hidden />
            Add person
          </button>
        }
      >
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">
          Change anyone&rsquo;s name, email or password here, your own too. It takes effect at once, with no verification email.
        </p>
        <DataTable
          columns={columns}
          rows={people.data?.people as Person[] | undefined}
          rowKey={(person) => person.id}
          onRowClick={(person) => setEditing(person)}
          rowLabel={(person) => `Edit ${person.name}`}
          loading={people.isPending}
          empty={<StateMessage icon={Users} title="Nobody yet" />}
        />
      </Panel>

      <section className="animate-rise-in rounded-3xl border border-destructive/40 bg-destructive/5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 font-display text-xl">
              <AlertTriangle className="size-5 text-rose-300" aria-hidden />
              Erase data and start over
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Removes bookings with their payments, receipts and emails, and if you choose, chats, documents, day-visit requests and files.
              Properties, rooms, prices, experiences, photos and everyone&rsquo;s sign-in stay. It can&rsquo;t be undone.
            </p>
          </div>
          <button type="button" onClick={() => setErasing(true)} className={buttonClass({ variant: "danger", shape: "pill" })}>
            <Trash2 aria-hidden />
            Erase data…
          </button>
        </div>
      </section>

      {editing && <PersonModal person={editing === "new" ? undefined : editing} me={people.data?.me} onClose={() => setEditing(undefined)} />}
      {erasing && <EraseWizard onClose={() => setErasing(false)} />}
    </div>
  );
}

function PasswordInput({ value, onChange, label, required }: { value: string; onChange: (value: string) => void; label: string; required?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="block text-xs">
      {label}
      <span className="relative mt-1 block">
        <input
          type={shown ? "text" : "password"}
          required={required}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} mt-0 pr-10`}
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );
}

/** Add a person, or change one: whatever the owner enters is saved as it is. */
function PersonModal({ person, me, onClose }: { person?: Person; me?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { properties } = useProperties();
  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [role, setRole] = useState<"admin" | "manager">(person?.role ?? "manager");
  const [propertyIds, setPropertyIds] = useState<string[]>(person?.propertyIds ?? []);
  const [password, setPassword] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const add = useMutation(trpc.admin.addPerson.mutationOptions());
  const update = useMutation(trpc.admin.updatePerson.mutationOptions());
  const setPasswordFor = useMutation(trpc.admin.setPassword.mutationOptions());
  const remove = useMutation(trpc.admin.removePerson.mutationOptions());
  const busy = add.isPending || update.isPending || setPasswordFor.isPending || remove.isPending;
  const self = person?.id === me;

  const done = async (message: string) => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: trpc.admin.pathKey() });
    onClose();
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const account = { name, email, role, propertyIds: role === "manager" ? propertyIds : [] };
    try {
      if (!person) {
        await add.mutateAsync({ ...account, password });
        await done(`${name} can sign in now`);
        return;
      }
      await update.mutateAsync({ id: person.id, ...account });
      if (password) await setPasswordFor.mutateAsync({ id: person.id, password });
      await done(password ? (self ? "Saved, with your new password" : `Saved. ${name} is signed out everywhere and uses the new password`) : "Saved");
    } catch (error) {
      toast.error(friendlyError(error as Error));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={person ? <KeyRound className="size-4" /> : <UserPlus className="size-4" />}
      title={person ? `Edit ${person.name}` : "Add person"}
      description="Saved exactly as entered: no verification email."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {person && !self ? (
            confirmingRemove ? (
              <span className="flex items-center gap-2 text-sm">
                Remove {person.name}?
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    remove.mutate(person.id, {
                      onSuccess: () => void done(`${person.name} can no longer sign in`),
                      onError: (error) => toast.error(friendlyError(error)),
                    })
                  }
                  className={buttonClass({ variant: "danger", size: "sm" })}
                >
                  Remove
                </button>
                <button type="button" onClick={() => setConfirmingRemove(false)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingRemove(true)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                <Trash2 aria-hidden />
                Remove
              </button>
            )
          ) : (
            <span />
          )}
          <button type="submit" form="person-form" disabled={busy || !name.trim() || !email.trim() || (!person && !password)} className={buttonClass({ shape: "pill" })}>
            {busy && <Spinner />}
            {person ? "Save" : "Add person"}
          </button>
        </div>
      }
    >
      <form id="person-form" onSubmit={(event) => void save(event)} className="space-y-4">
        <label className="block text-xs">
          Name
          <input required autoFocus value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-xs">
          Email (what they sign in with)
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
        </label>
        <PasswordInput
          label={person ? "New password (leave empty to keep the current one)" : "Password"}
          required={!person}
          value={password}
          onChange={setPassword}
        />
        <fieldset>
          <legend className="text-xs">Role</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ChoiceCard name="role" checked={role === "manager"} onChange={() => setRole("manager")} title="Manager" hint="Runs the properties you choose" />
            <ChoiceCard name="role" checked={role === "admin"} onChange={() => setRole("admin")} icon={<ShieldCheck className="size-4" />} title="Owner" hint="Everything, including Settings" />
          </div>
        </fieldset>
        {role === "manager" && (
          <fieldset className="animate-rise-in">
            <legend className="text-xs">Properties they manage</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {properties.map((property) => {
                const on = propertyIds.includes(property.id);
                return (
                  <button
                    key={property.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPropertyIds((current) => (on ? current.filter((id) => id !== property.id) : [...current, property.id]))}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 ${on ? "border-accent bg-accent text-accent-foreground" : "border-border/60 hover:border-accent/60"}`}
                  >
                    {property.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

const steps = [
  { key: "choose", label: "Choose" },
  { key: "check", label: "Check" },
  { key: "confirm", label: "Confirm" },
  { key: "done", label: "Done" },
] as const;

const COUNT_NAMES: Record<string, string> = {
  bookings: "bookings",
  receipts: "receipts",
  emails: "emails",
  paymentEvents: "payment records",
  bookingHistory: "history entries",
  chatMessages: "chat messages",
  quotations: "quotations",
  invoices: "invoices",
  registrationCards: "registration cards",
  letters: "letters",
  dayVisitRequests: "day-visit requests",
  files: "files",
  folders: "folders",
};

/** Erase in four steps: what, a last look at what stays and goes, type ERASE, done. */
function EraseWizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [chats, setChats] = useState(true);
  const [documents, setDocuments] = useState(true);
  const [dayVisits, setDayVisits] = useState(true);
  const [files, setFiles] = useState(false);
  const [restartNumbers, setRestartNumbers] = useState(true);
  const [typed, setTyped] = useState("");

  const erase = useMutation(
    trpc.admin.erase.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setStep(3);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const goes = [
    "All bookings, with their payments, receipts, history and emails",
    chats && "Every guest chat (website and WhatsApp)",
    documents && "Quotations, invoices, registration cards and letters",
    dayVisits && "Day-visit requests",
    files && "Every file and folder in Files, including the trash",
  ].filter(Boolean) as string[];
  const stays = [
    "Properties, rooms, prices by date and room blocks",
    "Experiences, day-visit offers and photos",
    "Everyone's sign-in, and the WhatsApp link",
    !chats && "Guest chats",
    !documents && "Quotations, invoices, registration cards and letters",
    !dayVisits && "Day-visit requests",
    !files && "Files",
  ].filter(Boolean) as string[];

  const next =
    step === 0
      ? { label: "Next", onClick: () => setStep(1) }
      : step === 1
        ? { label: "Next", onClick: () => setStep(2) }
        : step === 2
          ? {
              label: "Erase now",
              onClick: () => erase.mutate({ confirm: "ERASE", chats, documents, dayVisits, files, restartNumbers }),
              disabled: typed !== "ERASE",
              pending: erase.isPending,
              icon: <Trash2 aria-hidden />,
            }
          : undefined;

  const counts = erase.data?.counts ?? {};
  const summary = Object.entries(counts)
    .filter(([key, count]) => count > 0 && COUNT_NAMES[key])
    .map(([key, count]) => `${count} ${COUNT_NAMES[key]}`);

  return (
    <StepModal
      title="Erase data and start over"
      description="For a fresh start, such as going live after testing."
      icon={<AlertTriangle className="size-4" />}
      size="md"
      steps={steps}
      current={step}
      onClose={onClose}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
    >
      {step === 0 && (
        <div className="space-y-2.5">
          <p className="text-sm text-muted-foreground">Bookings and their payments always go. Choose what else:</p>
          <ChoiceCard type="checkbox" checked={chats} onChange={setChats} title="Guest chats" hint="Website and WhatsApp conversations" />
          <ChoiceCard type="checkbox" checked={documents} onChange={setDocuments} title="Documents" hint="Quotations, invoices, registration cards and letters" />
          <ChoiceCard type="checkbox" checked={dayVisits} onChange={setDayVisits} title="Day-visit requests" hint="The offers themselves stay" />
          <ChoiceCard type="checkbox" checked={files} onChange={setFiles} title="Files" hint="Everything in Files: contracts, photos, the trash" />
          <ChoiceCard type="checkbox" checked={restartNumbers} onChange={setRestartNumbers} title="Start numbering again" hint="Receipts, quotations, invoices, cards and letters from 1" />
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-rose-200">Erased</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {goes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border/60 p-4">
            <p className="text-sm font-medium">Kept</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {stays.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm">
            This can&rsquo;t be undone. Type <span className="font-mono font-semibold text-rose-300">ERASE</span> to confirm.
          </p>
          <input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="ERASE"
            autoComplete="off"
            className={`${inputClass} font-mono tracking-widest`}
          />
        </div>
      )}

      {step === 3 && (
        <DoneStep
          title="A fresh start"
          actions={
            <button type="button" onClick={onClose} className={buttonClass({ shape: "pill" })}>
              Done
            </button>
          }
        >
          {summary.length ? `Erased ${summary.join(", ")}.` : "There was nothing to erase."}
          {erase.data?.filesLeftInStorage ? ` ${erase.data.filesLeftInStorage} stored files couldn't be removed from storage; their records are gone.` : ""}
        </DoneStep>
      )}
    </StepModal>
  );
}
