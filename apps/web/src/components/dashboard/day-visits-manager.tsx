"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Mail, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { friendlyError, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import GalleryUpload from "./gallery-upload";
import { resolveImage } from "./image-upload";
import { useProperties } from "./property-context";

const field =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

function priceLabel(price: number | null): string {
  if (price === null) return "Price to be announced";
  if (price === 0) return "No charge";
  return `$${price} per person`;
}

function visitDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusTones: Record<string, string> = {
  requested: "bg-accent/15 text-accent",
  confirmed: "bg-emerald-500/15 text-emerald-300",
  declined: "bg-secondary text-muted-foreground",
  cancelled: "bg-secondary text-muted-foreground",
};

const filters = [
  { value: "requested", label: "Waiting" },
  { value: "confirmed", label: "Confirmed" },
  { value: undefined, label: "All" },
] as const;

/** Day visits: guests' requests to answer, and what is on offer at each property. */
export default function DayVisitsManager() {
  const { properties, selectedId, isLoading } = useProperties();
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("requested");
  const inScope = selectedId ? properties.filter((property) => property.id === selectedId) : properties;

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">Day visits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guests who want to come for the day, without staying the night. Confirm each one — guests pay as you
          arrange with them, never online.
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Requests</h2>
          <div className="inline-flex rounded-full border border-border p-0.5 text-xs">
            {filters.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  filter === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <RequestList propertyId={selectedId} status={filter} />
      </section>

      {inScope.map((property) => (
        <section key={property.id}>
          <OffersPanel propertyId={property.id} propertyName={property.name} />
        </section>
      ))}
    </div>
  );
}

function RequestList({ propertyId, status }: { propertyId?: string; status?: "requested" | "confirmed" }) {
  const requests = useQuery(trpc.dayVisits.bookings.queryOptions({ propertyId, status }));

  if (requests.isPending) return <Skeleton className="mt-4 h-24 w-full rounded-xl" />;
  if (requests.isError) return <p className="mt-4 text-sm text-destructive">{friendlyError(requests.error)}</p>;
  if (requests.data.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
        {status === "requested" ? "Nothing waiting — every request has been answered." : "No day visits here yet."}
      </p>
    );
  }
  return (
    <ul className="mt-4 space-y-3">
      {requests.data.map((request) => (
        <RequestRow key={request.id} request={request} />
      ))}
    </ul>
  );
}

type RequestRowData = {
  id: string;
  reference: string;
  visitName: string;
  propertyName: string;
  visitDate: string;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  note: string | null;
  pricePerPerson: number | null;
  status: string;
  staffNote: string | null;
  handledBy: string | null;
  channel: string;
};

function RequestRow({ request }: { request: RequestRowData }) {
  const queryClient = useQueryClient();
  const [answering, setAnswering] = useState<"confirmed" | "declined" | "cancelled">();
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");

  const answer = useMutation(
    trpc.dayVisits.answer.mutationOptions({
      onSuccess: (result) => {
        toast.success(`${result.reference} ${result.status} — the guest has been emailed`);
        setAnswering(undefined);
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const total = request.pricePerPerson ? request.pricePerPerson * request.guests : undefined;

  return (
    <li className="rounded-xl border border-border/70 bg-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs tracking-wider text-accent">{request.reference}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${statusTones[request.status] ?? ""}`}>
              {request.status === "requested" ? "waiting" : request.status}
            </span>
            {request.channel === "whatsapp" && <span className="text-[11px] text-muted-foreground">via WhatsApp</span>}
          </p>
          <p className="mt-1.5 font-display text-lg">
            {visitDay(request.visitDate)} · {request.guestName}
          </p>
          <p className="text-xs text-muted-foreground">
            {request.visitName} at {request.propertyName}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden /> {request.guests} {request.guests === 1 ? "guest" : "guests"}
          </p>
          <p className="mt-1">
            {priceLabel(request.pricePerPerson)}
            {total ? ` · $${total}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <a href={`tel:${request.guestPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-accent">
          <Phone className="h-3.5 w-3.5" aria-hidden /> {request.guestPhone}
        </a>
        <a href={`mailto:${request.guestEmail}`} className="inline-flex items-center gap-1.5 break-all hover:text-accent">
          <Mail className="h-3.5 w-3.5" aria-hidden /> {request.guestEmail}
        </a>
      </div>
      {request.note && <p className="mt-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs">“{request.note}”</p>}
      {request.staffNote && (
        <p className="mt-2 text-xs text-muted-foreground">
          Told the guest: {request.staffNote}
          {request.handledBy ? ` — ${request.handledBy}` : ""}
        </p>
      )}

      {!answering && (request.status === "requested" || request.status === "confirmed") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {request.status === "requested" && (
            <>
              <button
                type="button"
                onClick={() => setAnswering("confirmed")}
                className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setAnswering("declined")}
                className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-destructive/60"
              >
                Decline
              </button>
            </>
          )}
          {request.status === "confirmed" && (
            <button
              type="button"
              onClick={() => setAnswering("cancelled")}
              className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-destructive/60"
            >
              Cancel visit
            </button>
          )}
        </div>
      )}

      {answering && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            answer.mutate({
              id: request.id,
              status: answering,
              staffNote: note.trim() || undefined,
              ...(answering === "confirmed" && price !== "" ? { pricePerPerson: Number(price) } : {}),
            });
          }}
          className="mt-3 space-y-3 rounded-lg border border-border/60 p-3"
        >
          {answering === "confirmed" && request.pricePerPerson === null && (
            <label className="block text-xs">
              Price per person (USD) — the price for this visit was still to be announced
              <input
                type="number"
                min={0}
                max={100000}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="Leave blank to agree it with the guest"
                className={field}
              />
            </label>
          )}
          <label className="block text-xs">
            {answering === "confirmed"
              ? "A note for the guest (optional) — what to bring, how to pay"
              : answering === "declined"
                ? "Why, for the guest (optional) — e.g. we are fully booked that day"
                : "Why, for the guest (optional)"}
            <textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} className={field} />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={answer.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
            >
              {answer.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {answering === "confirmed" ? "Confirm and email the guest" : answering === "declined" ? "Decline and email the guest" : "Cancel and email the guest"}
            </button>
            <button type="button" onClick={() => setAnswering(undefined)} className="rounded-full border border-border px-4 py-1.5 text-xs">
              Back
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// What is on offer
// ---------------------------------------------------------------------------

type VisitDraft = {
  slug: string;
  name: string;
  description: string;
  price: string;
  toBeAnnounced: boolean;
  images: string[];
  sortOrder: string;
};

const emptyVisit: VisitDraft = {
  slug: "", name: "", description: "", price: "", toBeAnnounced: true, images: [], sortOrder: "0",
};

function OffersPanel({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const visits = useQuery(trpc.dayVisits.manage.queryOptions({ propertyId }));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const queryClient = useQueryClient();

  const toggleActive = useMutation(trpc.dayVisits.setActive.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }));
  const remove = useMutation(
    trpc.dayVisits.remove.mutationOptions({
      onSuccess: () => {
        setConfirmDelete(undefined);
        void queryClient.invalidateQueries();
      },
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">
          On offer <span className="text-muted-foreground">at {propertyName}</span>
        </h2>
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingId(undefined); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs hover:border-accent/50"
        >
          <Plus className="h-3 w-3" />
          Add day visit
        </button>
      </div>

      {adding && (
        <div className="mt-4 rounded-xl border border-border/70 bg-card p-4">
          <VisitForm
            propertyId={propertyId}
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); void queryClient.invalidateQueries(); }}
          />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {visits.data?.length === 0 && !adding && (
          <p className="rounded-xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
            Nothing on offer yet — add a day visit (the gardens, the pool, lunch) and guests can ask for a date on
            the website. You can leave the price as &ldquo;to be announced&rdquo;.
          </p>
        )}

        {visits.data?.map((visit) => (
          <div key={visit.id} className="rounded-xl border border-border/70 bg-card">
            <div className="flex items-center gap-4 p-3">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
                {visit.image && <img src={resolveImage(visit.image)} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate ${visit.active ? "" : "text-muted-foreground"}`}>
                  {visit.name}
                  {!visit.active && " (hidden)"}
                </p>
                <p className="text-xs text-muted-foreground">{priceLabel(visit.pricePerPerson)}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleActive.mutate({ id: visit.id, active: !visit.active })}
                  aria-label={visit.active ? `Hide ${visit.name}` : `Show ${visit.name}`}
                  className="rounded-full border border-border p-2 hover:border-accent/50"
                >
                  {visit.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId((current) => (current === visit.id ? undefined : visit.id))}
                  aria-label={`Edit ${visit.name}`}
                  className="rounded-full border border-border p-2 hover:border-accent/50"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(visit.id)}
                  aria-label={`Delete ${visit.name}`}
                  className="rounded-full border border-border p-2 hover:border-destructive/60 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {confirmDelete === visit.id && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border/70 bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">Delete {visit.name} for good? Hiding it keeps it for later.</p>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: visit.id })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-1.5 text-xs text-destructive-foreground disabled:opacity-50"
                >
                  {remove.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(undefined); remove.reset(); }}
                  className="rounded-full border border-border px-4 py-1.5 text-xs"
                >
                  Keep
                </button>
                {remove.error && <p className="w-full text-xs text-destructive">{remove.error.message}</p>}
              </div>
            )}

            {editingId === visit.id && (
              <div className="border-t border-border/70 p-3">
                <VisitForm
                  propertyId={propertyId}
                  visitId={visit.id}
                  onClose={() => setEditingId(undefined)}
                  onSaved={() => { setEditingId(undefined); void queryClient.invalidateQueries(); }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VisitForm({
  propertyId, visitId, onClose, onSaved,
}: {
  propertyId: string;
  visitId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visits = useQuery(trpc.dayVisits.manage.queryOptions({ propertyId }));
  const existing = visits.data?.find((visit) => visit.id === visitId);
  const [draft, setDraft] = useState<VisitDraft>(() =>
    existing
      ? {
          slug: existing.slug, name: existing.name, description: existing.description,
          price: existing.pricePerPerson === null ? "" : String(existing.pricePerPerson),
          toBeAnnounced: existing.pricePerPerson === null,
          images: existing.images.length > 0 ? existing.images : existing.image ? [existing.image] : [],
          sortOrder: String(existing.sortOrder),
        }
      : emptyVisit,
  );
  const create = useMutation(trpc.dayVisits.create.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.dayVisits.update.mutationOptions({ onSuccess: onSaved }));
  const [uploading, setUploading] = useState(false);
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const set = <K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      propertyId,
      slug: draft.slug, name: draft.name, description: draft.description,
      // Blank "to be announced" is a real state: guests can still ask to come.
      pricePerPerson: draft.toBeAnnounced ? null : Number(draft.price) || 0,
      images: draft.images, sortOrder: Number(draft.sortOrder) || 0,
    };
    if (visitId) update.mutate({ ...payload, id: visitId });
    else create.mutate(payload);
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <input required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Garden & grounds day" className={field} />
        </label>
        <label className="text-sm">
          Short code
          <input required value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder="garden-day" className={field} />
          <span className="mt-1 block text-xs text-muted-foreground">Lowercase, with dashes. Unique within this property.</span>
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <textarea
            required rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)}
            placeholder="What guests can do on the day, and when they can arrive and leave."
            className={field}
          />
        </label>
        <div className="text-sm">
          <label>
            Price per person (USD)
            <input
              type="number" min={0} max={100000}
              required={!draft.toBeAnnounced} disabled={draft.toBeAnnounced}
              value={draft.toBeAnnounced ? "" : draft.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder={draft.toBeAnnounced ? "To be announced" : "15"}
              className={`${field} disabled:opacity-50`}
            />
          </label>
          <label className="mt-2.5 flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={draft.toBeAnnounced}
              onChange={(e) => set("toBeAnnounced", e.target.checked)}
              className="size-4 accent-accent"
            />
            Price to be announced
          </label>
        </div>
        <label className="text-sm">
          Display order
          <input type="number" min={0} max={999} value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={field} />
          <span className="mt-1 block text-xs text-muted-foreground">Lower numbers are listed first</span>
        </label>
        <div className="border-t border-border/60 pt-4 sm:col-span-2">
          <GalleryUpload
            label="Photos (optional)"
            hint="Without photos, the property's own cover photo is shown. Drag to reorder."
            value={draft.images}
            onChange={(next) => setDraft((current) => ({ ...current, images: next(current.images) }))}
            folder={`day-visits/${draft.slug || "new"}`}
            max={20}
            onBusyChange={setUploading}
          />
        </div>
      </fieldset>

      {error && <p className="mt-4 text-sm text-destructive">{friendlyError(error)}</p>}

      <div className="mt-5 flex gap-3">
        <button
          type="submit" disabled={pending || uploading}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {(pending || uploading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {uploading ? "Waiting for uploads…" : visitId ? "Save day visit" : "Add day visit"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-border px-5 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
