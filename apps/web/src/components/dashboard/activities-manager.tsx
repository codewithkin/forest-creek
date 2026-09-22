"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Images, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

import GalleryUpload from "./gallery-upload";
import { resolveImage } from "./image-upload";
import { money } from "./kpi";

type ActivityDraft = {
  slug: string;
  name: string;
  description: string;
  price: string;
  free: boolean;
  /** Cover first; saved as images, with image derived server-side. */
  images: string[];
  sortOrder: string;
};

const emptyActivity: ActivityDraft = {
  slug: "", name: "", description: "", price: "", free: false, images: [], sortOrder: "0",
};

const field =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

/** Experiences saved before galleries existed only have their single cover. */
function activityPhotos(activity: { image: string; images: string[] }): string[] {
  if (activity.images.length > 0) return activity.images;
  return activity.image ? [activity.image] : [];
}

/** A zero price is what "free" means in the data — see packages/db/activities. */
function priceLabel(price: number): string {
  return price === 0 ? "Included in the stay" : `${money(price)} per booking`;
}

export default function ActivitiesPanel({ propertyId }: { propertyId: string }) {
  const activities = useQuery(trpc.activities.manage.queryOptions({ propertyId }));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const queryClient = useQueryClient();

  const toggleActive = useMutation(
    trpc.activities.setActive.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const remove = useMutation(
    trpc.activities.remove.mutationOptions({
      onSuccess: () => {
        setConfirmDelete(undefined);
        void queryClient.invalidateQueries();
      },
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg">Experiences</h3>
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingId(undefined); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs hover:border-accent/50"
        >
          <Plus className="h-3 w-3" />
          Add experience
        </button>
      </div>

      {adding && (
        <div className="mt-4">
          <ActivityForm
            propertyId={propertyId}
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); void queryClient.invalidateQueries(); }}
          />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {activities.data?.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            No experiences yet — a braai, the pool, a jumping castle. Add the first one.
          </p>
        )}

        {activities.data?.map((activity) => (
          <div key={activity.id} className="rounded-xl border border-border/70 bg-card">
            <div className="flex items-center gap-4 p-3">
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
                {activity.image && (
                  <img src={resolveImage(activity.image)} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-background/85 px-1.5 text-[10px] tabular-nums">
                  <Images className="h-2.5 w-2.5" aria-hidden />
                  {activityPhotos(activity).length}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate ${activity.active ? "" : "text-muted-foreground"}`}>
                  {activity.name}
                  {!activity.active && " (hidden)"}
                </p>
                <p className="text-xs text-muted-foreground">{priceLabel(activity.price)}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleActive.mutate({ id: activity.id, active: !activity.active })}
                  aria-label={activity.active ? `Hide ${activity.name}` : `Show ${activity.name}`}
                  className="rounded-full border border-border p-2 hover:border-accent/50"
                >
                  {activity.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingId((current) => (current === activity.id ? undefined : activity.id))
                  }
                  aria-label={`Edit ${activity.name}`}
                  className="rounded-full border border-border p-2 hover:border-accent/50"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(activity.id)}
                  aria-label={`Delete ${activity.name}`}
                  className="rounded-full border border-border p-2 hover:border-destructive/60 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {confirmDelete === activity.id && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border/70 bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Delete {activity.name} for good? Hiding it keeps it for later.
                </p>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: activity.id })}
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
                {remove.error && (
                  <p className="w-full text-xs text-destructive">{remove.error.message}</p>
                )}
              </div>
            )}

            {editingId === activity.id && (
              <div className="border-t border-border/70 p-3">
                <ActivityForm
                  propertyId={propertyId}
                  activityId={activity.id}
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

function ActivityForm({
  propertyId, activityId, onClose, onSaved,
}: {
  propertyId: string;
  activityId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const activities = useQuery(trpc.activities.manage.queryOptions({ propertyId }));
  const existing = activities.data?.find((activity) => activity.id === activityId);

  const [draft, setDraft] = useState<ActivityDraft>(() =>
    existing
      ? {
          slug: existing.slug, name: existing.name, description: existing.description,
          price: existing.price === 0 ? "" : String(existing.price),
          free: existing.price === 0,
          images: activityPhotos(existing), sortOrder: String(existing.sortOrder),
        }
      : emptyActivity,
  );

  const create = useMutation(trpc.activities.create.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.activities.update.mutationOptions({ onSuccess: onSaved }));
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string>();
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const set = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.images.length === 0) {
      setPhotoError("Add at least one photo — guests choose what they can see.");
      return;
    }
    setPhotoError(undefined);
    const payload = {
      propertyId,
      slug: draft.slug, name: draft.name, description: draft.description,
      // "Free" is not its own column: it writes a price of 0.
      price: draft.free ? 0 : Number(draft.price) || 0,
      images: draft.images, sortOrder: Number(draft.sortOrder) || 0,
    };
    if (activityId) update.mutate({ ...payload, id: activityId });
    else create.mutate(payload);
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <input
            required value={draft.name} onChange={(e) => set("name", e.target.value)}
            placeholder="Garden braai" className={field}
          />
        </label>
        <label className="text-sm">
          Short code
          <input
            required value={draft.slug} onChange={(e) => set("slug", e.target.value)}
            placeholder="garden-braai" className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Lowercase, with dashes. Unique within this property.
          </span>
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <textarea
            required rows={2} value={draft.description}
            onChange={(e) => set("description", e.target.value)} className={field}
          />
        </label>

        <div className="text-sm">
          <label>
            Price per booking (USD)
            <input
              type="number" min={0} max={100000}
              required={!draft.free} disabled={draft.free}
              value={draft.free ? "" : draft.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder={draft.free ? "Included" : "25"}
              className={`${field} disabled:opacity-50`}
            />
          </label>
          <label className="mt-2.5 flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={draft.free}
              onChange={(e) => set("free", e.target.checked)}
              className="size-4 accent-accent"
            />
            Free — included in the stay
          </label>
        </div>

        <label className="text-sm">
          Display order
          <input
            type="number" min={0} max={999} value={draft.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)} className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Lower numbers are listed first
          </span>
        </label>

        <div className="border-t border-border/60 pt-4 sm:col-span-2">
          <GalleryUpload
            label="Photos"
            hint="The cover leads the card; guests swipe through the rest. Drag to reorder."
            value={draft.images}
            onChange={(next) => {
              setPhotoError(undefined);
              setDraft((current) => ({ ...current, images: next(current.images) }));
            }}
            folder={`activities/${draft.slug || "new"}`}
            max={20}
            onBusyChange={setUploading}
          />
          {photoError && <p className="mt-2 text-xs text-destructive">{photoError}</p>}
        </div>
      </fieldset>

      {error && <p className="mt-4 text-sm text-destructive">{error.message}</p>}

      <div className="mt-5 flex gap-3">
        <button
          type="submit" disabled={pending || uploading}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {(pending || uploading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {uploading ? "Waiting for uploads…" : activityId ? "Save experience" : "Add experience"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-border px-5 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
