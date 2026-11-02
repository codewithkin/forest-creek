"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Download, Eye, FileText, Link2, Mail, MessageCircle, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { countNights, todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, friendlyError, Skeleton } from "@/components/brand/state";
import { QuoteSheetView } from "@/components/quote/quote-sheet-view";
import { trpc } from "@/utils/trpc";

import { money } from "./kpi";
import { useProperties } from "./property-context";
import { ChoiceCard, DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "guest", label: "Guest" },
  { key: "stay", label: "Stay" },
  { key: "send", label: "Send" },
  { key: "done", label: "Done" },
] as const;

const validity = [3, 7, 14, 30] as const;

type Line = {
  key: string;
  kind: "room" | "experience" | "custom";
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  description: string;
  unitPrice: string;
  quantity: string;
  /** Staff typed over the calendar's price. */
  priced: boolean;
  activityId?: string;
};

const blank = (kind: Line["kind"], overrides: Partial<Line> = {}): Line => ({
  key: crypto.randomUUID(),
  kind,
  roomId: "",
  checkIn: "",
  checkOut: "",
  guests: "2",
  description: "",
  unitPrice: "",
  quantity: "1",
  priced: false,
  ...overrides,
});

const lineAmount = (line: Line) =>
  (Number(line.unitPrice) || 0) * (line.kind === "room" ? countNights(line.checkIn, line.checkOut) : Number(line.quantity) || 0);

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

/** A room, its dates and guests. The price comes from the calendar; staff only change it if they agreed another. */
function RoomLine({
  line,
  rooms,
  onChange,
  onRemove,
}: {
  line: Line;
  rooms: { id: string; name: string; capacity: number; active: boolean }[];
  onChange: (patch: Partial<Line>) => void;
  onRemove?: () => void;
}) {
  const nights = countNights(line.checkIn, line.checkOut);
  const [editing, setEditing] = useState(line.priced);
  const price = useQuery({
    ...trpc.quotes.priceRoom.queryOptions({ roomId: line.roomId, checkIn: line.checkIn, checkOut: line.checkOut }),
    enabled: Boolean(line.roomId) && nights > 0,
  });
  const quoted = price.data?.unitPrice;
  useEffect(() => {
    if (quoted !== undefined && !line.priced) onChange({ unitPrice: String(quoted) });
    // Only when the calendar's answer changes, and never over a typed price.
  }, [quoted]);
  const room = rooms.find((candidate) => candidate.id === line.roomId);

  return (
    <div className="animate-rise-in space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_5rem]">
        <label className="text-xs">
          Room
          <select required value={line.roomId} onChange={(event) => onChange({ roomId: event.target.value })} className={inputClass}>
            <option value="" disabled>
              Choose a room
            </option>
            {rooms.filter((candidate) => candidate.active).map((candidate) => (
              <option key={candidate.id} value={candidate.id} className="bg-popover">
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Arrive
          <input
            required
            type="date"
            min={todayIso()}
            value={line.checkIn}
            onChange={(event) => onChange({ checkIn: event.target.value, checkOut: line.checkOut && line.checkOut > event.target.value ? line.checkOut : addDays(event.target.value, 1) })}
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Leave
          <input required type="date" min={line.checkIn ? addDays(line.checkIn, 1) : undefined} value={line.checkOut} onChange={(event) => onChange({ checkOut: event.target.value })} className={inputClass} />
        </label>
        <label className="text-xs">
          Guests
          <input required type="number" min={1} max={room?.capacity} value={line.guests} onChange={(event) => onChange({ guests: event.target.value })} className={inputClass} />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {nights > 0 && line.roomId ? (
          editing ? (
            <label className="flex items-center gap-2 text-xs">
              Agreed price per night
              <input
                type="number"
                min={0}
                autoFocus
                value={line.unitPrice}
                onChange={(event) => onChange({ unitPrice: event.target.value, priced: true })}
                className="w-24 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm"
              />
            </label>
          ) : (
            <p className="text-muted-foreground">
              {nights} {nights === 1 ? "night" : "nights"} × {price.isFetching ? "…" : money(Number(line.unitPrice) || 0)}{" "}
              <button type="button" onClick={() => setEditing(true)} className="ml-1 text-xs text-accent underline-offset-4 hover:underline">
                Change price
              </button>
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">Pick a room and dates: the price comes from the calendar.</p>
        )}
        <div className="flex items-center gap-3">
          {nights > 0 && <span key={lineAmount(line)} className="animate-rise-in font-medium">{money(lineAmount(line))}</span>}
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label="Remove this room" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemLine({ line, onChange, onRemove }: { line: Line; onChange: (patch: Partial<Line>) => void; onRemove: () => void }) {
  return (
    <div className="grid animate-rise-in gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 sm:grid-cols-[1fr_4.5rem_6rem_auto] sm:items-end">
      <label className="text-xs">
        Item
        <input required autoFocus value={line.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Conference hall" className={inputClass} />
      </label>
      <label className="text-xs">
        Qty
        <input required type="number" min={1} value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} className={inputClass} />
      </label>
      <label className="text-xs">
        Price each
        <input required type="number" min={0} value={line.unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} className={inputClass} />
      </label>
      <button type="button" onClick={onRemove} aria-label="Remove line" className="justify-self-end rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

/**
 * New quotation in four steps: who it is for, what they want (prices,
 * nights and totals are worked out), how it goes out (email, WhatsApp or
 * download), done. Saved as a draft when the preview opens.
 */
export function QuoteBuilder({ editId, onClose, onSaved }: { editId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { selectedId, properties } = useProperties();
  const queryClient = useQueryClient();
  const existing = useQuery({ ...trpc.quotes.byId.queryOptions(editId ?? ""), enabled: Boolean(editId) });

  const [step, setStep] = useState(0);
  const [quoteId, setQuoteId] = useState(editId);
  const [propertyId, setPropertyId] = useState(selectedId ?? properties[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [company, setCompany] = useState("");
  const [showCompany, setShowCompany] = useState(false);
  const [days, setDays] = useState<number>(7);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [lines, setLines] = useState<Line[]>([blank("room")]);
  const [byEmail, setByEmail] = useState(true);
  const [byWhatsapp, setByWhatsapp] = useState(false);
  const [download, setDownload] = useState(false);
  const [outcome, setOutcome] = useState<{ routes: string[]; problem: string | null; downloaded: boolean }>();

  // Opening a draft fills the form once.
  const loaded = existing.data;
  useEffect(() => {
    if (!loaded) return;
    setPropertyId(loaded.propertyId);
    setGuestName(loaded.guestName);
    setGuestEmail(loaded.guestEmail);
    setGuestPhone(loaded.guestPhone ?? "");
    setCompany(loaded.company ?? "");
    setShowCompany(Boolean(loaded.company));
    setNotes(loaded.notes ?? "");
    setShowNotes(Boolean(loaded.notes));
    setDiscount(loaded.discount ? String(loaded.discount) : "");
    setDiscountNote(loaded.discountNote ?? "");
    setShowDiscount(loaded.discount > 0);
    const left = Math.round((Date.parse(`${loaded.validUntil}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000);
    setDays(validity.find((choice) => choice >= left) ?? 30);
    setLines(
      loaded.rawLines.map((line) =>
        blank(line.kind as Line["kind"], {
          roomId: line.roomId ?? "",
          checkIn: line.checkIn ? String(line.checkIn).slice(0, 10) : "",
          checkOut: line.checkOut ? String(line.checkOut).slice(0, 10) : "",
          guests: String(line.guests ?? 2),
          description: line.description,
          unitPrice: String(line.unitPrice),
          quantity: String(line.quantity),
          priced: true,
        }),
      ),
    );
  }, [loaded]);

  const rooms = useQuery({ ...trpc.properties.rooms.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const activities = useQuery({ ...trpc.activities.manage.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const saved = useQuery({ ...trpc.quotes.byId.queryOptions(quoteId ?? ""), enabled: Boolean(quoteId) && step >= 2 });

  const patch = (key: string, change: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
  const remove = (key: string) => setLines((current) => current.filter((line) => line.key !== key));
  const toggleActivity = (activity: { id: string; name: string; price: number }) =>
    setLines((current) =>
      current.some((line) => line.activityId === activity.id)
        ? current.filter((line) => line.activityId !== activity.id)
        : [...current, blank("experience", { activityId: activity.id, description: activity.name, unitPrice: String(activity.price) })],
    );

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + lineAmount(line), 0), [lines]);
  const off = showDiscount ? Number(discount) || 0 : 0;
  const total = subtotal - off;
  const roomLines = lines.filter((line) => line.kind === "room");
  const stayReady =
    lines.length > 0 &&
    total > 0 &&
    off <= subtotal &&
    roomLines.every((line) => line.roomId && countNights(line.checkIn, line.checkOut) > 0) &&
    lines.every((line) => line.kind === "room" || line.description.trim());

  const save = useMutation({
    mutationFn: async () => {
      const quote = {
        propertyId,
        guestName,
        guestEmail,
        guestPhone: guestPhone || undefined,
        company: showCompany && company ? company : undefined,
        validUntil: addDays(todayIso(), days),
        notes: showNotes && notes ? notes : undefined,
        discount: off,
        discountNote: off > 0 && discountNote ? discountNote : undefined,
        lines: lines.map((line) =>
          line.kind === "room"
            ? { kind: "room" as const, roomId: line.roomId, checkIn: line.checkIn, checkOut: line.checkOut, guests: Number(line.guests), unitPrice: Math.round(Number(line.unitPrice)) }
            : { kind: line.kind, description: line.description, unitPrice: Math.round(Number(line.unitPrice)), quantity: Number(line.quantity) },
        ),
      };
      return quoteId ? updateDraft.mutateAsync({ id: quoteId, quote }) : createDraft.mutateAsync(quote);
    },
    onSuccess: async (quote) => {
      setQuoteId(quote.id);
      await queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() });
      setByEmail(Boolean(guestEmail));
      setByWhatsapp(!guestEmail && Boolean(guestPhone));
      setDownload(!guestEmail && !guestPhone);
      setStep(2);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const createDraft = useMutation(trpc.quotes.create.mutationOptions());
  const updateDraft = useMutation(trpc.quotes.update.mutationOptions());
  const send = useMutation(trpc.quotes.send.mutationOptions());
  const issue = useMutation(trpc.quotes.issue.mutationOptions());

  const deliver = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("Save the quotation first");
      let routes: string[] = [];
      let problem: string | null = null;
      if (byEmail || byWhatsapp) {
        const result = await send.mutateAsync({ id: quoteId, email: byEmail, whatsapp: byWhatsapp });
        routes = [result.emailed && "email", result.whatsapped && "WhatsApp"].filter((route): route is string => Boolean(route));
        problem = result.problem;
      }
      if (download) {
        if (routes.length === 0) await issue.mutateAsync(quoteId);
        // The PDF answers as an attachment, so the dashboard stays where it is.
        window.location.assign(`/quote/${quoteId}/pdf`);
      }
      return { routes, problem, downloaded: download };
    },
    onSuccess: async (result) => {
      setOutcome(result);
      if (result.problem) toast.warning(result.problem);
      await queryClient.invalidateQueries();
      setStep(3);
    },
    onError: async (error) => {
      toast.error(friendlyError(error));
      await queryClient.invalidateQueries();
    },
  });

  function startOver() {
    setStep(0);
    setQuoteId(undefined);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setCompany("");
    setShowCompany(false);
    setNotes("");
    setShowNotes(false);
    setDiscount("");
    setDiscountNote("");
    setShowDiscount(false);
    setLines([blank("room")]);
    setOutcome(undefined);
  }

  const link = quoteId ? `${window.location.origin}/quote/${quoteId}` : "";
  const deliverLabel = byEmail || byWhatsapp ? (download ? "Send and download" : "Send quotation") : "Download PDF";

  const next =
    step === 0
      ? { label: "Next", form: "quote-guest", disabled: !guestName.trim() }
      : step === 1
        ? { label: "Preview", form: "quote-stay", disabled: !stayReady, pending: save.isPending, icon: <Eye aria-hidden /> }
        : step === 2
          ? {
              label: deliverLabel,
              onClick: () => deliver.mutate(),
              disabled: !saved.data || (!byEmail && !byWhatsapp && !download),
              pending: deliver.isPending,
              icon: byEmail || byWhatsapp ? <Send aria-hidden /> : <Download aria-hidden />,
            }
          : undefined;

  return (
    <StepModal
      title={editId ? "Edit quotation" : "New quotation"}
      description={step === 2 ? "This is exactly what the guest receives." : "Only what you know: prices, nights and totals are worked out for you."}
      icon={<FileText className="size-4" />}
      steps={steps}
      current={step}
      // The preview is a full sheet: it needs the room.
      size={step === 2 ? "xl" : "lg"}
      onClose={() => {
        if (step === 3 && quoteId) onSaved(quoteId);
        else onClose();
      }}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={
        step === 1 ? (
          <span>
            Total{" "}
            <span key={total} className="ml-1 inline-block animate-rise-in font-display text-xl">
              {money(Math.max(0, total))}
            </span>
          </span>
        ) : step === 2 && quoteId ? (
          <span className="text-xs text-muted-foreground">Saved as a draft</span>
        ) : undefined
      }
    >
      {step === 0 && (
        <form
          id="quote-guest"
          onSubmit={(event) => {
            event.preventDefault();
            if (guestName.trim()) setStep(1);
          }}
          className="space-y-4"
        >
          {properties.length > 1 && (
            <label className="block text-xs">
              Property
              <select
                value={propertyId}
                onChange={(event) => {
                  setPropertyId(event.target.value);
                  setLines([blank("room")]);
                }}
                className={inputClass}
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id} className="bg-popover">
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            Guest name
            <input required autoFocus value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Tariro Moyo" className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs">
              Email <span className="text-muted-foreground">(to email it)</span>
              <input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="guest@example.com" className={inputClass} />
            </label>
            <label className="text-xs">
              WhatsApp <span className="text-muted-foreground">(to message it)</span>
              <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="0771 234 567" className={inputClass} />
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
        <form
          id="quote-stay"
          onSubmit={(event) => {
            event.preventDefault();
            if (stayReady) save.mutate();
          }}
          className="space-y-5"
        >
          <div className="space-y-3">
            {lines.map((line) =>
              line.kind === "room" ? (
                <RoomLine
                  key={line.key}
                  line={line}
                  rooms={rooms.data ?? []}
                  onChange={(change) => patch(line.key, change)}
                  onRemove={roomLines.length > 1 || lines.length > 1 ? () => remove(line.key) : undefined}
                />
              ) : line.kind === "custom" ? (
                <ItemLine key={line.key} line={line} onChange={(change) => patch(line.key, change)} onRemove={() => remove(line.key)} />
              ) : null,
            )}
          </div>

          {(activities.data?.filter((activity) => activity.active).length ?? 0) > 0 && (
            <div>
              <p className="text-xs">Experiences</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activities.data?.filter((activity) => activity.active).map((activity) => {
                  const on = lines.some((line) => line.activityId === activity.id);
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleActivity(activity)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-all duration-200 active:scale-95 ${
                        on ? "border-accent bg-accent text-accent-foreground" : "border-border/60 hover:border-accent/60"
                      }`}
                    >
                      {activity.name} · {activity.price === 0 ? "included" : money(activity.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <button type="button" onClick={() => setLines((current) => [...current, blank("room")])} className="inline-flex items-center gap-1 text-accent hover:underline">
              <BedDouble className="size-3.5" aria-hidden />
              Another room
            </button>
            <button type="button" onClick={() => setLines((current) => [...current, blank("custom")])} className="inline-flex items-center gap-1 text-accent hover:underline">
              <Plus className="size-3.5" aria-hidden />
              Other item
            </button>
            {!showDiscount && (
              <button type="button" onClick={() => setShowDiscount(true)} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Discount
              </button>
            )}
            {!showNotes && (
              <button type="button" onClick={() => setShowNotes(true)} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Note for the guest
              </button>
            )}
          </div>

          {showDiscount && (
            <div className="grid animate-rise-in gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
              <label className="text-xs">
                Discount (USD)
                <input type="number" min={0} autoFocus value={discount} onChange={(event) => setDiscount(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                Reason, shown to the guest
                <input value={discountNote} onChange={(event) => setDiscountNote(event.target.value)} placeholder="Group rate" className={inputClass} />
              </label>
              <button type="button" onClick={() => setShowDiscount(false)} aria-label="Remove discount" className="justify-self-end rounded-full p-2 text-muted-foreground hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
          )}
          {off > subtotal && <p className="text-sm text-rose-300">The discount is larger than the quotation.</p>}

          {showNotes && (
            <label className="block animate-rise-in text-xs">
              Note for the guest
              <textarea rows={2} autoFocus value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
            </label>
          )}

          <div>
            <p className="text-xs">Valid for</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {validity.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={days === choice}
                  onClick={() => setDays(choice)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${days === choice ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {choice} days
                </button>
              ))}
              <span className="text-xs text-muted-foreground">until {longDay(addDays(todayIso(), days))}</span>
            </div>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
          <div className="min-w-0">
            {saved.isPending && <Skeleton className="h-[28rem] w-full rounded-2xl" />}
            {saved.isError && <ErrorMessage title="The preview didn't load" error={saved.error} onRetry={() => void saved.refetch()} />}
            {saved.data && <QuoteSheetView quote={saved.data} className="animate-modal-in" />}
          </div>
          <fieldset className="space-y-2.5">
            <legend className="mb-2 text-xs">How should it go out?</legend>
            <ChoiceCard
              type="checkbox"
              checked={byEmail}
              onChange={setByEmail}
              disabled={!guestEmail}
              icon={<Mail className="size-4" />}
              title="Email"
              hint={guestEmail || "No email: add one in step 1"}
            />
            <ChoiceCard
              type="checkbox"
              checked={byWhatsapp}
              onChange={setByWhatsapp}
              disabled={!guestPhone}
              icon={<MessageCircle className="size-4" />}
              title="WhatsApp"
              hint={guestPhone || "No number: add one in step 1"}
            />
            <ChoiceCard
              type="checkbox"
              checked={download}
              onChange={setDownload}
              icon={<Download className="size-4" />}
              title="Download PDF"
              hint="To print or send yourself"
            />
          </fieldset>
        </div>
      )}

      {step === 3 && saved.data && (
        <DoneStep
          title={outcome?.routes.length ? "Quotation sent" : "Quotation ready"}
          actions={
            <>
              <a href={`/quote/${saved.data.id}/pdf`} className={buttonClass({ variant: "secondary", shape: "pill" })}>
                <Download aria-hidden />
                PDF
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}
                className={buttonClass({ variant: "secondary", shape: "pill" })}
              >
                <Link2 aria-hidden />
                Copy guest link
              </button>
              <button type="button" onClick={startOver} className={buttonClass({ variant: "ghost", shape: "pill" })}>
                <Plus aria-hidden />
                New quotation
              </button>
              <button type="button" onClick={() => onSaved(saved.data!.id)} className={buttonClass({ shape: "pill" })}>
                Done
              </button>
            </>
          }
        >
          <p>
            <span className="font-mono text-accent">{saved.data.label}</span> for {saved.data.guestName}, {money(saved.data.total)}.
          </p>
          <p className="mt-1">
            {outcome?.routes.length ? `Sent by ${outcome.routes.join(" and ")}.` : ""}
            {outcome?.downloaded ? " The PDF is downloading." : ""} The guest can accept it online until {longDay(saved.data.validUntil)}.
          </p>
        </DoneStep>
      )}
    </StepModal>
  );
}
