"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Images, Loader2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

import GalleryUpload from "./gallery-upload";
import ImageUpload, { resolveImage } from "./image-upload";
import { money } from "./kpi";
import { useProperties } from "./property-context";

type PropertyDraft = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  location: string;
  phone: string;
  email: string;
  heroImage: string;
  gallery: string[];
  amenities: string;
  sortOrder: string;
};

const emptyProperty: PropertyDraft = {
  slug: "", name: "", tagline: "", description: "", location: "",
  phone: "", email: "", heroImage: "", gallery: [], amenities: "", sortOrder: "0",
};

type RoomDraft = {
  tier: string;
  name: string;
  description: string;
  pricePerNight: string;
  capacity: string;
  bedType: string;
  amenities: string;
  /** Cover first; saved as images, with image derived server-side. */
  images: string[];
  sortOrder: string;
};

const emptyRoom: RoomDraft = {
  tier: "", name: "", description: "", pricePerNight: "",
  capacity: "2", bedType: "", amenities: "", images: [], sortOrder: "0",
};

/** Rooms saved before galleries existed only have their single cover image. */
function roomPhotos(room: { image: string; images: string[] }): string[] {
  if (room.images.length > 0) return room.images;
  return room.image ? [room.image] : [];
}

const field =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

function toList(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

export default function PropertiesManager() {
  const { properties, isLoading } = useProperties();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [roomsForId, setRoomsForId] = useState<string>();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries();

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-secondary" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Properties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {properties.length} {properties.length === 1 ? "property" : "properties"} in your care.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreating(true); setEditingId(undefined); }}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground"
        >
          <Plus className="h-4 w-4" />
          Add property
        </button>
      </div>

      {creating && (
        <PropertyForm
          title="New property"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void invalidate(); }}
        />
      )}

      <div className="space-y-4">
        {properties.map((property) => (
          <div key={property.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            <PropertyRow
              propertyId={property.id}
              onEdit={() => { setEditingId(property.id); setCreating(false); }}
              onToggleRooms={() =>
                setRoomsForId((current) => (current === property.id ? undefined : property.id))
              }
              roomsOpen={roomsForId === property.id}
            />

            {editingId === property.id && (
              <div className="border-t border-border/70 p-4 sm:p-6">
                <PropertyForm
                  title={`Edit ${property.name}`}
                  propertyId={property.id}
                  onClose={() => setEditingId(undefined)}
                  onSaved={() => { setEditingId(undefined); void invalidate(); }}
                />
              </div>
            )}

            {roomsForId === property.id && (
              <div className="border-t border-border/70 bg-popover/40 p-4 sm:p-6">
                <RoomsPanel propertyId={property.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PropertyRow({
  propertyId, onEdit, onToggleRooms, roomsOpen,
}: {
  propertyId: string;
  onEdit: () => void;
  onToggleRooms: () => void;
  roomsOpen: boolean;
}) {
  const { data } = useQuery(trpc.properties.mine.queryOptions());
  const property = data?.find((candidate) => candidate.id === propertyId);
  const rooms = useQuery(trpc.properties.rooms.queryOptions({ propertyId }));

  if (!property) return null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
      <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-secondary sm:h-20 sm:w-28">
        {property.heroImage && (
          <img src={resolveImage(property.heroImage)} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl">{property.name}</h2>
          {!property.active && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              hidden
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{property.location}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          /{property.slug} · {rooms.data?.length ?? 0} rooms
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onToggleRooms}
          className="rounded-full border border-border px-4 py-2 text-xs hover:border-accent/50"
        >
          {roomsOpen ? "Hide rooms" : "Rooms"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${property.name}`}
          className="rounded-full border border-border p-2 hover:border-accent/50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PropertyForm({
  title, propertyId, onClose, onSaved,
}: {
  title: string;
  propertyId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = useQuery(trpc.properties.mine.queryOptions()).data?.find(
    (candidate) => candidate.id === propertyId,
  );

  const [draft, setDraft] = useState<PropertyDraft>(() =>
    existing
      ? {
          slug: existing.slug, name: existing.name, tagline: existing.tagline,
          description: existing.description, location: existing.location,
          phone: existing.phone, email: existing.email, heroImage: existing.heroImage,
          gallery: existing.gallery, amenities: existing.amenities.join(", "),
          sortOrder: String(existing.sortOrder),
        }
      : emptyProperty,
  );

  const create = useMutation(trpc.properties.create.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.properties.update.mutationOptions({ onSuccess: onSaved }));
  const [uploading, setUploading] = useState(false);
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const set = <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      slug: draft.slug, name: draft.name, tagline: draft.tagline,
      description: draft.description, location: draft.location, phone: draft.phone,
      email: draft.email, heroImage: draft.heroImage, gallery: draft.gallery,
      amenities: toList(draft.amenities), sortOrder: Number(draft.sortOrder) || 0,
    };
    if (propertyId) update.mutate({ ...payload, id: propertyId });
    else create.mutate(payload);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border/70 bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <fieldset disabled={pending} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <input required value={draft.name} onChange={(e) => set("name", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Web address
          <input
            required value={draft.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="misty-ridge" className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Appears as /{draft.slug || "your-property"}
          </span>
        </label>
        <label className="text-sm sm:col-span-2">
          Tagline
          <input required value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} className={field} />
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <textarea required rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Location
          <input required value={draft.location} onChange={(e) => set("location", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Phone
          <input required value={draft.phone} onChange={(e) => set("phone", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Reservations email
          <input required type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Amenities
          <input
            value={draft.amenities} onChange={(e) => set("amenities", e.target.value)}
            placeholder="Fireplaces, Valley views" className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">Separate with commas</span>
        </label>
        <label className="text-sm">
          Display order
          <input
            type="number" min={0} max={999} value={draft.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)} className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Lower numbers appear first on the Places page
          </span>
        </label>

        <div className="sm:col-span-2">
          <ImageUpload
            label="Cover photo — shown on the Places page and at the top of the property page"
            value={draft.heroImage}
            onChange={(url) => set("heroImage", url)}
            folder={`properties/${draft.slug || "new"}`}
          />
        </div>

        <div className="border-t border-border/60 pt-4 sm:col-span-2">
          <GalleryUpload
            label="Gallery"
            hint="Shown in the property page gallery after the cover photo. Drag to reorder."
            value={draft.gallery}
            onChange={(update) =>
              setDraft((current) => ({ ...current, gallery: update(current.gallery) }))
            }
            folder={`properties/${draft.slug || "new"}/gallery`}
            max={24}
            coverLabel={null}
            onBusyChange={setUploading}
          />
        </div>
      </fieldset>

      {error && <p className="mt-4 text-sm text-destructive">{error.message}</p>}

      <div className="mt-6 flex gap-3">
        <button
          type="submit" disabled={pending || uploading}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {(pending || uploading) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {uploading ? "Waiting for uploads…" : propertyId ? "Save changes" : "Create property"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-border px-6 py-2.5 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoomsPanel({ propertyId }: { propertyId: string }) {
  const rooms = useQuery(trpc.properties.rooms.queryOptions({ propertyId }));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const queryClient = useQueryClient();

  const toggleActive = useMutation(
    trpc.properties.setRoomActive.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg">Rooms</h3>
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingId(undefined); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs hover:border-accent/50"
        >
          <Plus className="h-3 w-3" />
          Add room
        </button>
      </div>

      {adding && (
        <div className="mt-4">
          <RoomForm
            propertyId={propertyId}
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); void queryClient.invalidateQueries(); }}
          />
        </div>
      )}

      {/* When every room is hidden, surface it loudly with a one-click publish. */}
      {rooms.data && rooms.data.length > 0 && rooms.data.every((r) => !r.active) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-200/80">
            All {rooms.data.length} room{rooms.data.length === 1 ? "" : "s"} are hidden — guests
            and the concierge AI see nothing.
          </p>
          <button
            type="button"
            disabled={toggleActive.isPending}
            onClick={() => {
              for (const room of rooms.data) {
                if (!room.active) toggleActive.mutate({ id: room.id, active: true });
              }
            }}
            className="mt-3 rounded-full border border-amber-500/40 px-4 py-1.5 text-xs text-amber-200/90 transition-colors hover:border-amber-500/70"
          >
            Publish all rooms
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {rooms.data?.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No rooms yet — add the first one.</p>
        )}

        {rooms.data?.map((room) => (
          <div key={room.id} className="rounded-xl border border-border/70 bg-card">
            <div className="flex items-center gap-4 p-3">
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
                {room.image && <img src={resolveImage(room.image)} alt="" className="h-full w-full object-cover" />}
                <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded-full bg-background/85 px-1.5 text-[10px] tabular-nums">
                  <Images className="h-2.5 w-2.5" aria-hidden />
                  {roomPhotos(room).length}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate ${room.active ? "" : "text-muted-foreground"}`}>
                  {room.name}
                  {!room.active && " (hidden)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {money(room.pricePerNight)}/night · sleeps {room.capacity} · {room.bedType}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleActive.mutate({ id: room.id, active: !room.active })}
                  aria-label={room.active ? `Hide ${room.name}` : `Show ${room.name}`}
                  className="rounded-full border border-border p-2 hover:border-accent/50"
                >
                  {room.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId((current) => (current === room.id ? undefined : room.id))}
                  aria-label={`Edit ${room.name}`}
                  className="rounded-full border border-border p-2 hover:border-accent/50"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>

            {editingId === room.id && (
              <div className="border-t border-border/70 p-3">
                <RoomForm
                  propertyId={propertyId}
                  roomId={room.id}
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

function RoomForm({
  propertyId, roomId, onClose, onSaved,
}: {
  propertyId: string;
  roomId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const rooms = useQuery(trpc.properties.rooms.queryOptions({ propertyId }));
  const existing = rooms.data?.find((room) => room.id === roomId);

  const [draft, setDraft] = useState<RoomDraft>(() =>
    existing
      ? {
          tier: existing.tier, name: existing.name, description: existing.description,
          pricePerNight: String(existing.pricePerNight), capacity: String(existing.capacity),
          bedType: existing.bedType, amenities: existing.amenities.join(", "),
          images: roomPhotos(existing), sortOrder: String(existing.sortOrder),
        }
      : emptyRoom,
  );

  const create = useMutation(trpc.properties.createRoom.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.properties.updateRoom.mutationOptions({ onSuccess: onSaved }));
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string>();
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const set = <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.images.length === 0) {
      setPhotoError("Add at least one photo — guests book what they can see.");
      return;
    }
    setPhotoError(undefined);
    const payload = {
      propertyId,
      tier: draft.tier, name: draft.name, description: draft.description,
      pricePerNight: Number(draft.pricePerNight), capacity: Number(draft.capacity),
      bedType: draft.bedType, amenities: toList(draft.amenities),
      images: draft.images, sortOrder: Number(draft.sortOrder) || 0,
    };
    if (roomId) update.mutate({ ...payload, id: roomId });
    else create.mutate(payload);
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Room name
          <input required value={draft.name} onChange={(e) => set("name", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Short code
          <input
            required value={draft.tier} onChange={(e) => set("tier", e.target.value)}
            placeholder="executive" className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">Unique within this property</span>
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <textarea required rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Price per night (USD)
          <input required type="number" min={1} value={draft.pricePerNight} onChange={(e) => set("pricePerNight", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Sleeps
          <input required type="number" min={1} max={40} value={draft.capacity} onChange={(e) => set("capacity", e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Bed type
          <input required value={draft.bedType} onChange={(e) => set("bedType", e.target.value)} placeholder="King" className={field} />
        </label>
        <label className="text-sm">
          Amenities
          <input value={draft.amenities} onChange={(e) => set("amenities", e.target.value)} placeholder="En-suite, Balcony" className={field} />
          <span className="mt-1 block text-xs text-muted-foreground">Separate with commas</span>
        </label>
        <label className="text-sm">
          Display order
          <input
            type="number" min={0} max={999} value={draft.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)} className={field}
          />
          <span className="mt-1 block text-xs text-muted-foreground">Lower numbers are listed first</span>
        </label>
        <div className="border-t border-border/60 pt-4 sm:col-span-2">
          <GalleryUpload
            label="Room photos"
            hint="The cover leads the room card; guests swipe through the rest. Drag to reorder."
            value={draft.images}
            onChange={(update) => {
              setPhotoError(undefined);
              setDraft((current) => ({ ...current, images: update(current.images) }));
            }}
            folder={`rooms/${draft.tier || "new"}`}
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
          {uploading ? "Waiting for uploads…" : roomId ? "Save room" : "Add room"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-border px-5 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
