"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mail, Plus, Receipt, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { friendlyError } from "@/components/brand/state";
import { DocumentSheetView } from "@/components/sheet/document-sheet-view";
import { authClient } from "@/lib/auth-client";
import { invoiceSheet } from "@/lib/invoice/invoice-sheet";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { ChoiceCard, DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "to", label: "Billed to" },
  { key: "items", label: "Items" },
  { key: "issue", label: "Issue" },
  { key: "done", label: "Done" },
] as const;

type Line = { key: string; description: string; detail: string; quantity: string; unitPrice: string };

const blank = (overrides: Partial<Line> = {}): Line => ({ key: crypto.randomUUID(), description: "", detail: "", quantity: "1", unitPrice: "", ...overrides });

const cents = (dollars: number) => Math.round(dollars * 100);
const money = (centsValue: number) =>
  `$${(centsValue / 100).toLocaleString("en-US", { minimumFractionDigits: centsValue % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * A new invoice in four steps: who it is billed to, what for (amounts, VAT
 * and totals are worked out), issue it (email and/or PDF), done. An invoice
 * isn't edited once issued; a wrong one is voided and issued again.
 */
export function InvoiceBuilder({ bookingId, onClose, onIssued }: { bookingId?: string; onClose: () => void; onIssued: (id: string) => void }) {
  const { selectedId, properties } = useProperties();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const draft = useQuery({ ...trpc.invoices.fromBooking.queryOptions(bookingId ?? ""), enabled: Boolean(bookingId) });

  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState(selectedId ?? properties[0]?.id ?? "");
  const [billedTo, setBilledTo] = useState("");
  const [company, setCompany] = useState("");
  const [showCompany, setShowCompany] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [vat, setVat] = useState<string>();
  const [paid, setPaid] = useState<string>();
  const [dueOn, setDueOn] = useState<string>();
  const [notes, setNotes] = useState<string>();
  const [byEmail, setByEmail] = useState(false);
  const [download, setDownload] = useState(true);

  // From a booking: everything it knows, once.
  const loaded = draft.data;
  useEffect(() => {
    if (!loaded) return;
    setPropertyId(loaded.propertyId);
    setBilledTo(loaded.billedTo);
    setEmail(loaded.email);
    setPhone(loaded.phone ?? "");
    setReference(loaded.reference);
    if (loaded.paid > 0) setPaid(String(loaded.paid));
    setLines(loaded.lines.map((line) => blank({ description: line.description, detail: line.detail ?? "", quantity: String(line.quantity), unitPrice: String(line.unitPrice) })));
  }, [loaded]);

  const patch = (key: string, change: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));

  const vatRate = vat === undefined ? 0 : Number(vat) || 0;
  const totals = useMemo(() => {
    const amounts = lines.map((line) => Math.round((Number(line.quantity) || 0) * cents(Number(line.unitPrice) || 0)));
    const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
    const vatCents = Math.round((subtotal * vatRate) / 100);
    return { amounts, subtotal, vat: vatCents, total: subtotal + vatCents };
  }, [lines, vatRate]);
  const paidCents = Math.min(paid === undefined ? 0 : cents(Number(paid) || 0), Math.max(0, totals.total));

  const itemsReady = lines.length > 0 && lines.every((line) => line.description.trim() && Number(line.quantity) > 0 && line.unitPrice !== "") && totals.total >= 0;
  // The address and phone for the preview, from the same cached list the property picker uses.
  const mine = useQuery(trpc.properties.mine.queryOptions());
  const property = mine.data?.find((candidate) => candidate.id === propertyId);

  const create = useMutation(trpc.invoices.create.mutationOptions());
  const sendEmail = useMutation(trpc.invoices.email.mutationOptions());
  const issue = useMutation({
    mutationFn: async () => {
      const invoice = await create.mutateAsync({
        propertyId,
        bookingId: loaded?.bookingId,
        billedTo,
        company: showCompany && company ? company : undefined,
        email,
        phone: phone || undefined,
        reference: reference || undefined,
        issuedOn,
        dueOn: dueOn || undefined,
        vatRate,
        paid: paidCents / 100,
        notes: notes || undefined,
        lines: lines.map((line) => ({
          description: line.description,
          detail: line.detail || undefined,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
      });
      let emailed = false;
      let problem: string | undefined;
      if (byEmail) {
        try {
          await sendEmail.mutateAsync(invoice.id);
          emailed = true;
        } catch (error) {
          problem = friendlyError(error as Error);
        }
      }
      // The PDF answers as an attachment, so the dashboard stays where it is.
      if (download) window.location.assign(`/invoice/${invoice.id}/pdf`);
      return { id: invoice.id, emailed, problem };
    },
    onSuccess: async (result) => {
      if (result.problem) toast.warning(`Issued, but not emailed: ${result.problem}`);
      await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
      setStep(3);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const issued = useQuery({ ...trpc.invoices.byId.queryOptions(issue.data?.id ?? ""), enabled: Boolean(issue.data?.id) });

  // The preview before an invoice exists: its number is only given when issued.
  const preview = property
    ? invoiceSheet({
        label: "Numbered when issued",
        status: "issued",
        billedTo: billedTo || "—",
        company: showCompany && company ? company : null,
        reference: reference || null,
        issuedOn,
        dueOn: dueOn ?? null,
        vatRate,
        subtotalCents: totals.subtotal,
        vatCents: totals.vat,
        totalCents: totals.total,
        paidCents,
        balanceCents: Math.max(0, totals.total - paidCents),
        notes: notes ?? null,
        preparedBy: session?.user.name || session?.user.email || "",
        lines: lines.map((line, index) => ({
          id: line.key,
          description: line.description || "—",
          detail: line.detail || null,
          quantity: Number(line.quantity) || 0,
          unitPriceCents: cents(Number(line.unitPrice) || 0),
          amountCents: totals.amounts[index] ?? 0,
        })),
        property: { name: property.name, location: property.location, phone: property.phone, email: property.email },
      })
    : undefined;

  const next =
    step === 0
      ? { label: "Next", form: "invoice-to", disabled: !billedTo.trim() }
      : step === 1
        ? {
            label: "Preview",
            onClick: () => {
              setByEmail(Boolean(email));
              setStep(2);
            },
            disabled: !itemsReady,
          }
        : step === 2
          ? {
              label: byEmail && download ? "Issue, email and download" : byEmail ? "Issue and email" : download ? "Issue and download" : "Issue invoice",
              onClick: () => issue.mutate(),
              pending: issue.isPending,
              icon: <Receipt aria-hidden />,
            }
          : undefined;

  return (
    <StepModal
      title="New invoice"
      description={step === 2 ? "This is exactly what they receive." : "Only what you know: amounts, VAT and totals are worked out for you."}
      icon={<Receipt className="size-4" />}
      steps={steps}
      current={step}
      size={step === 2 ? "xl" : "lg"}
      onClose={() => (step === 3 && issue.data ? onIssued(issue.data.id) : onClose())}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={
        step === 1 ? (
          <span>
            Total{" "}
            <span key={totals.total} className="ml-1 inline-block animate-rise-in font-display text-xl">
              {money(totals.total)}
            </span>
          </span>
        ) : undefined
      }
    >
      {step === 0 && (
        <form
          id="invoice-to"
          onSubmit={(event) => {
            event.preventDefault();
            if (billedTo.trim()) setStep(1);
          }}
          className="space-y-4"
        >
          {properties.length > 1 && (
            <label className="block text-xs">
              From
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={inputClass}>
                {properties.map((candidate) => (
                  <option key={candidate.id} value={candidate.id} className="bg-popover">
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            Billed to
            <input required autoFocus value={billedTo} onChange={(event) => setBilledTo(event.target.value)} placeholder="Mr Moyo" className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs">
              Email <span className="text-muted-foreground">(to email it)</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Date
              <input required type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Ref no. <span className="text-muted-foreground">(optional)</span>
              <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Booking or order number" className={inputClass} />
            </label>
            <label className="text-xs">
              Phone <span className="text-muted-foreground">(optional)</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} />
            </label>
          </div>
          {showCompany ? (
            <label className="block animate-rise-in text-xs">
              Company
              <input autoFocus value={company} onChange={(event) => setCompany(event.target.value)} className={inputClass} />
            </label>
          ) : (
            <button type="button" onClick={() => setShowCompany(true)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Plus className="size-3.5" aria-hidden />
              For a company
            </button>
          )}
        </form>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.key} className="grid animate-rise-in gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 sm:grid-cols-[1fr_4.5rem_6.5rem_5.5rem_auto] sm:items-end">
                <label className="text-xs">
                  Item or service
                  <input autoFocus={index === lines.length - 1 && !line.description} value={line.description} onChange={(event) => patch(line.key, { description: event.target.value })} placeholder="Executive Room" className={inputClass} />
                </label>
                <label className="text-xs">
                  Qty
                  <input type="number" min={0} step="any" value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} className={inputClass} />
                </label>
                <label className="text-xs">
                  Unit (USD)
                  <input type="number" step="0.01" value={line.unitPrice} onChange={(event) => patch(line.key, { unitPrice: event.target.value })} className={inputClass} />
                </label>
                <p className="pb-2.5 text-right text-sm font-medium">{money(totals.amounts[index] ?? 0)}</p>
                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
                  aria-label="Remove item"
                  className="justify-self-end rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <button type="button" onClick={() => setLines((current) => [...current, blank()])} className="inline-flex items-center gap-1 text-accent hover:underline">
              <Plus className="size-3.5" aria-hidden />
              Another item
            </button>
            {vat === undefined && (
              <button type="button" onClick={() => setVat("15")} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                VAT
              </button>
            )}
            {paid === undefined && (
              <button type="button" onClick={() => setPaid("")} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Already paid
              </button>
            )}
            {dueOn === undefined && (
              <button type="button" onClick={() => setDueOn(issuedOn)} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Due date
              </button>
            )}
            {notes === undefined && (
              <button type="button" onClick={() => setNotes("")} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Note
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {vat !== undefined && (
              <Optional label="VAT (%)" onRemove={() => setVat(undefined)}>
                <input type="number" min={0} max={100} step="0.01" autoFocus value={vat} onChange={(event) => setVat(event.target.value)} className={inputClass} />
              </Optional>
            )}
            {paid !== undefined && (
              <Optional label="Already paid (USD)" onRemove={() => setPaid(undefined)}>
                <input type="number" min={0} step="0.01" autoFocus value={paid} onChange={(event) => setPaid(event.target.value)} className={inputClass} />
              </Optional>
            )}
            {dueOn !== undefined && (
              <Optional label="Due by" onRemove={() => setDueOn(undefined)}>
                <input type="date" min={issuedOn} value={dueOn} onChange={(event) => setDueOn(event.target.value)} className={inputClass} />
              </Optional>
            )}
          </div>
          {notes !== undefined && (
            <Optional label="Note on the invoice" onRemove={() => setNotes(undefined)}>
              <textarea rows={2} autoFocus value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
            </Optional>
          )}

          <dl className="ml-auto max-w-xs space-y-1 rounded-2xl bg-secondary/50 px-4 py-3 text-sm">
            {vatRate > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Sub-total</dt>
                  <dd>{money(totals.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>VAT ({vatRate}%)</dt>
                  <dd>{money(totals.vat)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between font-medium">
              <dt>Grand total</dt>
              <dd>{money(totals.total)}</dd>
            </div>
            {paidCents > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Balance due</dt>
                <dd>{money(Math.max(0, totals.total - paidCents))}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {step === 2 && preview && (
        <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
          <DocumentSheetView sheet={preview} className="min-w-0 animate-modal-in" />
          <fieldset className="space-y-2.5">
            <legend className="mb-2 text-xs">When it's issued</legend>
            <ChoiceCard type="checkbox" checked={byEmail} onChange={setByEmail} disabled={!email} icon={<Mail className="size-4" />} title="Email it" hint={email || "No email: add one in step 1"} />
            <ChoiceCard type="checkbox" checked={download} onChange={setDownload} icon={<Download className="size-4" />} title="Download PDF" hint="To print, sign or send yourself" />
            <p className="px-1 text-xs text-muted-foreground">Issued invoices aren&rsquo;t edited: a wrong one is voided and issued again.</p>
          </fieldset>
        </div>
      )}

      {step === 3 && issued.data && (
        <DoneStep
          title="Invoice issued"
          actions={
            <>
              <a href={`/invoice/${issued.data.id}/pdf`} className={buttonClass({ variant: "secondary", shape: "pill" })}>
                <Download aria-hidden />
                PDF
              </a>
              <button type="button" onClick={() => onIssued(issued.data!.id)} className={buttonClass({ shape: "pill" })}>
                Done
              </button>
            </>
          }
        >
          <p>
            <span className="font-mono text-accent">{issued.data.label}</span> to {issued.data.billedTo}, {money(issued.data.totalCents)}.
          </p>
          <p className="mt-1">
            {issue.data?.emailed ? `Emailed to ${issued.data.email}. ` : ""}
            {download ? "The PDF is downloading." : ""}
          </p>
        </DoneStep>
      )}
    </StepModal>
  );
}

function Optional({ label, onRemove, children }: { label: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="relative animate-rise-in">
      <label className="block text-xs">
        {label}
        {children}
      </label>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="absolute top-0 right-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
