"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { countNights, todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { money } from "./kpi";
import { useProperties } from "./property-context";
import { Modal } from "./ui/overlay";

const inputClass =
  "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

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
};

const newKey = () => crypto.randomUUID();

const blank = (kind: Line["kind"], overrides: Partial<Line> = {}): Line => ({
  key: newKey(),
  kind,
  roomId: "",
  checkIn: "",
  checkOut: "",
  guests: "2",
  description: "",
  unitPrice: "",
  quantity: "1",
  ...overrides,
});

const lineAmount = (line: Line) =>
  (Number(line.unitPrice) || 0) * (line.kind === "room" ? countNights(line.checkIn, line.checkOut) : Number(line.quantity) || 0);

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Fills a room line's price from the calendar when its room or dates change. */
function RoomLine({ line, rooms, onChange, onRemove }: {
  line: Line;
  rooms: { id: string; name: string; capacity: number; active: boolean }[];
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const nights = countNights(line.checkIn, line.checkOut);
  const price = useQuery({
    ...trpc.quotes.priceRoom.queryOptions({ roomId: line.roomId, checkIn: line.checkIn, checkOut: line.checkOut }),
    enabled: Boolean(line.roomId) && nights > 0,
  });
  const quoted = price.data?.unitPrice;
  useEffect(() => {
    if (quoted !== undefined) onChange({ unitPrice: String(quoted) });
    // Only when the calendar's answer changes: staff may then type over it.
  }, [quoted]);

  return (
    <div className="grid gap-2 rounded-2xl bg-secondary/40 p-3 sm:grid-cols-[1.4fr_1fr_1fr_4.5rem_6rem_auto] sm:items-end">
      <label className="text-xs">
        Room
        <select required value={line.roomId} onChange={(event) => onChange({ roomId: event.target.value })} className={inputClass}>
          <option value="" disabled>
            Choose
          </option>
          {rooms.filter((room) => room.active).map((room) => (
            <option key={room.id} value={room.id} className="bg-popover">
              {room.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Arrive
        <input required type="date" value={line.checkIn} onChange={(event) => onChange({ checkIn: event.target.value })} className={inputClass} />
      </label>
      <label className="text-xs">
        Leave
        <input required type="date" min={line.checkIn || undefined} value={line.checkOut} onChange={(event) => onChange({ checkOut: event.target.value })} className={inputClass} />
      </label>
      <label className="text-xs">
        Guests
        <input required type="number" min={1} value={line.guests} onChange={(event) => onChange({ guests: event.target.value })} className={inputClass} />
      </label>
      <label className="text-xs">
        Per night
        <input required type="number" min={0} value={line.unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} className={inputClass} />
      </label>
      <button type="button" onClick={onRemove} aria-label="Remove line" className="justify-self-end rounded-full p-2 text-muted-foreground hover:text-foreground">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function ItemLine({ line, onChange, onRemove }: { line: Line; onChange: (patch: Partial<Line>) => void; onRemove: () => void }) {
  return (
    <div className="grid gap-2 rounded-2xl bg-secondary/40 p-3 sm:grid-cols-[1fr_4.5rem_6rem_auto] sm:items-end">
      <label className="text-xs">
        {line.kind === "experience" ? "Experience" : "Item"}
        <input required value={line.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Conference hall" className={inputClass} />
      </label>
      <label className="text-xs">
        Qty
        <input required type="number" min={1} value={line.quantity} onChange={(event) => onChange({ quantity: event.target.value })} className={inputClass} />
      </label>
      <label className="text-xs">
        Price each
        <input required type="number" min={0} value={line.unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} className={inputClass} />
      </label>
      <button type="button" onClick={onRemove} aria-label="Remove line" className="justify-self-end rounded-full p-2 text-muted-foreground hover:text-foreground">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

/** Writes or edits a draft, with a running total. Sending happens from the drawer. */
export function QuoteBuilder({ editId, onClose, onSaved }: { editId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { selectedId, properties } = useProperties();
  const queryClient = useQueryClient();
  const existing = useQuery({ ...trpc.quotes.byId.queryOptions(editId ?? ""), enabled: Boolean(editId) });

  const [propertyId, setPropertyId] = useState(selectedId ?? properties[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [company, setCompany] = useState("");
  const [validUntil, setValidUntil] = useState(addDays(todayIso(), 7));
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank("room")]);

  // Opening a draft fills the form once.
  const loaded = existing.data;
  useEffect(() => {
    if (!loaded) return;
    setPropertyId(loaded.propertyId);
    setGuestName(loaded.guestName);
    setGuestEmail(loaded.guestEmail);
    setGuestPhone(loaded.guestPhone ?? "");
    setCompany(loaded.company ?? "");
    setValidUntil(loaded.validUntil);
    setNotes(loaded.notes ?? "");
    setDiscount(loaded.discount ? String(loaded.discount) : "");
    setDiscountNote(loaded.discountNote ?? "");
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
        }),
      ),
    );
  }, [loaded]);

  const rooms = useQuery({ ...trpc.properties.rooms.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const activities = useQuery({ ...trpc.activities.manage.queryOptions({ propertyId }), enabled: Boolean(propertyId) });

  const patch = (key: string, change: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
  const remove = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + lineAmount(line), 0), [lines]);
  const off = Number(discount) || 0;
  const total = subtotal - off;

  const options = {
    onSuccess: async (quote: { id: string }) => {
      toast.success("Quotation saved");
      await queryClient.invalidateQueries();
      onSaved(quote.id);
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  };
  const create = useMutation(trpc.quotes.create.mutationOptions(options));
  const update = useMutation(trpc.quotes.update.mutationOptions(options));
  const pending = create.isPending || update.isPending;

  const ready = Boolean(guestName.trim()) && lines.length > 0 && total > 0 && off <= subtotal;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const quote = {
      propertyId,
      guestName,
      guestEmail,
      guestPhone: guestPhone || undefined,
      company: company || undefined,
      validUntil,
      notes: notes || undefined,
      discount: off,
      discountNote: discountNote || undefined,
      lines: lines.map((line) =>
        line.kind === "room"
          ? { kind: "room" as const, roomId: line.roomId, checkIn: line.checkIn, checkOut: line.checkOut, guests: Number(line.guests), unitPrice: Math.round(Number(line.unitPrice)) }
          : { kind: line.kind, description: line.description, unitPrice: Math.round(Number(line.unitPrice)), quantity: Number(line.quantity) },
      ),
    };
    if (editId) update.mutate({ id: editId, quote });
    else create.mutate(quote);
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<FileText className="size-4" />}
      title={editId ? "Edit quotation" : "New quotation"}
      description="Prices are frozen when you save. A quotation doesn't hold a room."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Total <span className="ml-1 font-display text-xl">{money(Math.max(0, total))}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", shape: "pill" })}>
              Cancel
            </button>
            <button type="submit" form="quote-builder" disabled={!ready || pending} className={buttonClass({ shape: "pill" })}>
              {pending && <Spinner />}
              Save draft
            </button>
          </div>
        </div>
      }
    >
      <form id="quote-builder" onSubmit={submit} className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {properties.length > 1 && (
            <label className="text-xs">
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
          <label className="text-xs">
            Guest name
            <input required value={guestName} onChange={(event) => setGuestName(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            Company (optional)
            <input value={company} onChange={(event) => setCompany(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            Email
            <input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            WhatsApp number
            <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="0771 234 567" className={inputClass} />
          </label>
          <label className="text-xs">
            Valid until
            <input required type="date" min={todayIso()} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={inputClass} />
          </label>
        </div>

        <div className="space-y-2">
          {lines.map((line) =>
            line.kind === "room" ? (
              <RoomLine key={line.key} line={line} rooms={rooms.data ?? []} onChange={(change) => patch(line.key, change)} onRemove={() => remove(line.key)} />
            ) : (
              <ItemLine key={line.key} line={line} onChange={(change) => patch(line.key, change)} onRemove={() => remove(line.key)} />
            ),
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLines((current) => [...current, blank("room")])} className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Plus aria-hidden />
              Room
            </button>
            {(activities.data?.length ?? 0) > 0 && (
              <select
                value=""
                aria-label="Add an experience"
                onChange={(event) => {
                  const activity = activities.data?.find((candidate) => candidate.id === event.target.value);
                  if (activity) setLines((current) => [...current, blank("experience", { description: activity.name, unitPrice: String(activity.price) })]);
                }}
                className="h-8 rounded-lg border border-border bg-transparent px-2 text-xs"
              >
                <option value="" className="bg-popover">
                  + Experience
                </option>
                {activities.data?.filter((activity) => activity.active).map((activity) => (
                  <option key={activity.id} value={activity.id} className="bg-popover">
                    {activity.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => setLines((current) => [...current, blank("custom")])} className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Plus aria-hidden />
              Other item
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <label className="text-xs">
            Discount (USD)
            <input type="number" min={0} value={discount} onChange={(event) => setDiscount(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            Reason (shown to the guest)
            <input value={discountNote} onChange={(event) => setDiscountNote(event.target.value)} placeholder="Group rate" className={inputClass} />
          </label>
        </div>
        {off > subtotal && <p className="text-sm text-destructive">The discount is larger than the quotation.</p>}

        <label className="block text-xs">
          Notes for the guest (optional)
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
        </label>
      </form>
    </Modal>
  );
}
