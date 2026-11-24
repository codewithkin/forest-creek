"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Coffee,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { friendlyError, Skeleton } from "@/components/brand/state";
import { formatMenuPrice, MENU_KIND_LABELS, parseMenuPrice, type MenuKind } from "@/lib/menu-format";
import { trpc } from "@/utils/trpc";

import ImageUpload, { resolveImage } from "./image-upload";
import { useProperties } from "./property-context";
import { Modal } from "./ui/overlay";
import { FilterPills, PageHeader, Panel, StatusChip } from "./ui/page";

const field =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";
const iconButton = "rounded-full border border-border p-2 transition-colors hover:border-accent/50 disabled:opacity-40";
const primary =
  "inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50";
const secondary = "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:border-accent/50";

type Section = {
  id: string;
  name: string;
  kind: string;
  note: string | null;
  active: boolean;
  items: Item[];
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  tags: string[];
  image: string | null;
  available: boolean;
};

/** Moves one id up or down a list, for the reorder buttons. */
function moved(ids: string[], id: string, by: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** The lodge's food and bar menu, one property at a time. */
export default function MenuManager() {
  const { selectedId, properties, isLoading } = useProperties();
  // A menu belongs to one house: with every property in view, show the first.
  const propertyId = selectedId ?? properties[0]?.id;
  const property = properties.find((candidate) => candidate.id === propertyId);
  const [kind, setKind] = useState<MenuKind>("food");
  const [editingSection, setEditingSection] = useState<Section | "new">();
  const [editingItem, setEditingItem] = useState<{ section: Section; item?: Item }>();
  const [deleting, setDeleting] = useState<{ kind: "section" | "item"; id: string; name: string }>();

  const queryClient = useQueryClient();
  const menu = useQuery({ ...trpc.menu.manage.queryOptions({ propertyId: propertyId ?? "" }), enabled: Boolean(propertyId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.menu.manage.queryKey({ propertyId: propertyId ?? "" }) });
  const onError = (error: { message?: string }) => toast.error(friendlyError(error));

  const template = useMutation(
    trpc.menu.addTemplate.mutationOptions({
      onSuccess: ({ added }) => {
        toast.success(added > 0 ? `Added ${added} sections — now fill them in` : "The menu already has every template section");
        void refresh();
      },
      onError,
    }),
  );
  const updateSection = useMutation(trpc.menu.updateSection.mutationOptions({ onSuccess: refresh, onError }));
  const updateItem = useMutation(trpc.menu.updateItem.mutationOptions({ onSuccess: refresh, onError }));
  const reorder = useMutation(trpc.menu.reorder.mutationOptions({ onSuccess: refresh, onError }));
  const deleteSection = useMutation(trpc.menu.deleteSection.mutationOptions({ onSuccess: refresh, onError }));
  const deleteItem = useMutation(trpc.menu.deleteItem.mutationOptions({ onSuccess: refresh, onError }));

  if (isLoading) return <Skeleton className="h-48 w-full rounded-3xl" />;
  if (!propertyId || !property) {
    return <PageHeader title="Menu" subtitle="Add a property first — every menu belongs to one." />;
  }

  const sections = (menu.data ?? []) as Section[];
  const shown = sections.filter((section) => section.kind === kind);
  const counts = { food: 0, bar: 0 } as Record<MenuKind, number>;
  for (const section of sections) counts[section.kind as MenuKind] += section.items.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu"
        subtitle={<>Food and bar at {property.name} — shown on the website&rsquo;s Menu page, in the printable menu, and told to guests by the Guide.</>}
        actions={
          <>
            <a href="/menu" target="_blank" rel="noopener noreferrer" className={secondary}>
              <ExternalLink className="size-4" /> View
            </a>
            <a href={`/menu/pdf?property=${encodeURIComponent(property.slug)}`} className={secondary}>
              <Download className="size-4" /> Printable menu
            </a>
            <button type="button" onClick={() => setEditingSection("new")} className={primary}>
              <Plus className="size-4" /> Add section
            </button>
          </>
        }
      />

      <FilterPills
        label="Food or bar"
        value={kind}
        onChange={setKind}
        options={[
          { key: "food", label: "Food", count: counts.food },
          { key: "bar", label: "Bar", count: counts.bar },
        ]}
      />

      {menu.isPending && <Skeleton className="h-40 w-full rounded-3xl" />}

      {menu.data && sections.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <UtensilsCrossed className="size-8 text-accent" />
            <h2 className="font-display text-2xl">No menu yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Start from our template — Breakfast, Mains & Grills, Sides, Kids Corner, Desserts, then the bar from shakes and mocktails to spirits —
              and fill in your dishes and prices. Rename, hide or delete any section.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button type="button" disabled={template.isPending} onClick={() => template.mutate({ propertyId })} className={primary}>
                {template.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Start from the template
              </button>
              <button type="button" onClick={() => setEditingSection("new")} className={secondary}>
                <Plus className="size-4" /> Blank section
              </button>
            </div>
          </div>
        </Panel>
      )}

      {menu.data && sections.length > 0 && shown.length === 0 && (
        <Panel>
          <p className="py-4 text-center text-sm text-muted-foreground">
            No {MENU_KIND_LABELS[kind].toLowerCase()} sections yet.{" "}
            <button type="button" onClick={() => setEditingSection("new")} className="text-accent underline underline-offset-4">
              Add one
            </button>
            {" "}or{" "}
            <button type="button" onClick={() => template.mutate({ propertyId })} className="text-accent underline underline-offset-4">
              add the template&rsquo;s
            </button>
            .
          </p>
        </Panel>
      )}

      {shown.map((section, index) => {
        const sectionIds = shown.map((candidate) => candidate.id);
        const itemIds = section.items.map((item) => item.id);
        return (
          <Panel
            key={section.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {section.kind === "bar" ? <Wine className="size-4 text-accent" /> : <Coffee className="size-4 text-accent" />}
                {section.name}
                {!section.active && <StatusChip>Hidden</StatusChip>}
              </span>
            }
            action={
              <div className="flex gap-1.5">
                <button
                  type="button" aria-label={`Move ${section.name} up`} disabled={index === 0 || reorder.isPending}
                  onClick={() => reorder.mutate({ propertyId, sectionIds: moved(sectionIds, section.id, -1) })}
                  className={iconButton}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button" aria-label={`Move ${section.name} down`} disabled={index === shown.length - 1 || reorder.isPending}
                  onClick={() => reorder.mutate({ propertyId, sectionIds: moved(sectionIds, section.id, 1) })}
                  className={iconButton}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button" aria-label={section.active ? `Hide ${section.name}` : `Show ${section.name}`}
                  onClick={() => updateSection.mutate({ id: section.id, active: !section.active })}
                  className={iconButton}
                >
                  {section.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button type="button" aria-label={`Edit ${section.name}`} onClick={() => setEditingSection(section)} className={iconButton}>
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button" aria-label={`Delete ${section.name}`}
                  onClick={() => setDeleting({ kind: "section", id: section.id, name: section.name })}
                  className={`${iconButton} hover:border-destructive/60 hover:text-destructive`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            }
          >
            {section.note && <p className="-mt-2 mb-3 text-xs text-muted-foreground">{section.note}</p>}
            {section.items.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                Nothing here yet — guests won&rsquo;t see this section until it has something in it.
              </p>
            )}
            <ul className="divide-y divide-border/50">
              {section.items.map((item, itemIndex) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  {item.image ? (
                    <img src={resolveImage(item.image)} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="hidden size-12 shrink-0 rounded-xl bg-secondary sm:block" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`flex flex-wrap items-center gap-2 ${item.available ? "" : "text-muted-foreground line-through"}`}>
                      {item.name}
                      {!item.available && <StatusChip tone="bad">Sold out</StatusChip>}
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground no-underline">
                          {tag}
                        </span>
                      ))}
                    </p>
                    {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  <span className="shrink-0 font-display text-lg tabular-nums">{formatMenuPrice(item.priceCents)}</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button" aria-label={`Move ${item.name} up`} disabled={itemIndex === 0 || reorder.isPending}
                      onClick={() => reorder.mutate({ sectionId: section.id, itemIds: moved(itemIds, item.id, -1) })}
                      className={`${iconButton} hidden sm:block`}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button" aria-label={`Move ${item.name} down`} disabled={itemIndex === itemIds.length - 1 || reorder.isPending}
                      onClick={() => reorder.mutate({ sectionId: section.id, itemIds: moved(itemIds, item.id, 1) })}
                      className={`${iconButton} hidden sm:block`}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateItem.mutate({ id: item.id, available: !item.available })}
                      className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent/50"
                    >
                      {item.available ? "Sold out" : "Back on"}
                    </button>
                    <button type="button" aria-label={`Edit ${item.name}`} onClick={() => setEditingItem({ section, item })} className={iconButton}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button" aria-label={`Delete ${item.name}`}
                      onClick={() => setDeleting({ kind: "item", id: item.id, name: item.name })}
                      className={`${iconButton} hover:border-destructive/60 hover:text-destructive`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setEditingItem({ section })} className={`${secondary} mt-3`}>
              <Plus className="size-4" /> Add {section.kind === "bar" ? "a drink" : "a dish"}
            </button>
          </Panel>
        );
      })}

      {editingSection && (
        <SectionForm
          propertyId={propertyId}
          kind={kind}
          section={editingSection === "new" ? undefined : editingSection}
          onClose={() => setEditingSection(undefined)}
          onSaved={() => { setEditingSection(undefined); void refresh(); }}
        />
      )}
      {editingItem && (
        <ItemForm
          section={editingItem.section}
          item={editingItem.item}
          propertySlug={property.slug}
          onClose={() => setEditingItem(undefined)}
          onSaved={() => { setEditingItem(undefined); void refresh(); }}
        />
      )}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? ""}?`}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(undefined)} className={secondary}>Keep it</button>
            <button
              type="button"
              disabled={deleteSection.isPending || deleteItem.isPending}
              onClick={() => {
                if (!deleting) return;
                const done = { onSuccess: () => setDeleting(undefined) };
                if (deleting.kind === "section") deleteSection.mutate({ id: deleting.id }, done);
                else deleteItem.mutate({ id: deleting.id }, done);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-sm text-destructive-foreground disabled:opacity-50"
            >
              {(deleteSection.isPending || deleteItem.isPending) && <Loader2 className="size-4 animate-spin" />}
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {deleting?.kind === "section"
            ? "The section and everything in it come off the menu for good. To take it off for a while, hide it instead."
            : "It comes off the menu for good. If it has only run out, mark it Sold out instead."}
        </p>
      </Modal>
    </div>
  );
}

function SectionForm({
  propertyId, kind, section, onClose, onSaved,
}: {
  propertyId: string;
  kind: MenuKind;
  section?: Section;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(section?.name ?? "");
  const [sectionKind, setSectionKind] = useState<MenuKind>((section?.kind as MenuKind) ?? kind);
  const [note, setNote] = useState(section?.note ?? "");
  const create = useMutation(trpc.menu.createSection.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.menu.updateSection.mutationOptions({ onSuccess: onSaved }));
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  function save(event: React.FormEvent) {
    event.preventDefault();
    const data = { name, kind: sectionKind, note: note.trim() || null };
    if (section) update.mutate({ id: section.id, ...data });
    else create.mutate({ propertyId, ...data });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={section ? `Edit ${section.name}` : "New section"}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondary}>Cancel</button>
          <button type="submit" form="menu-section-form" disabled={pending} className={primary}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {section ? "Save" : "Add section"}
          </button>
        </>
      }
    >
      <form id="menu-section-form" onSubmit={save} className="space-y-4">
        <label className="block text-sm">
          Name
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakfast" className={field} />
        </label>
        <fieldset className="text-sm">
          <legend>Part of the menu</legend>
          <div className="mt-1.5 flex gap-2">
            {(["food", "bar"] as const).map((option) => (
              <label
                key={option}
                className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center ${sectionKind === option ? "border-accent text-accent" : "border-border/70 text-muted-foreground"}`}
              >
                <input type="radio" name="kind" className="sr-only" checked={sectionKind === option} onChange={() => setSectionKind(option)} />
                {MENU_KIND_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          A line under the heading <span className="text-muted-foreground">(optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Served 7 to 10am" className={field} />
        </label>
        {error && <p className="text-sm text-destructive">{friendlyError(error)}</p>}
      </form>
    </Modal>
  );
}

function ItemForm({
  section, item, propertySlug, onClose, onSaved,
}: {
  section: Section;
  item?: Item;
  propertySlug: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.priceCents == null ? "" : (item.priceCents / 100).toFixed(item.priceCents % 100 ? 2 : 0));
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [image, setImage] = useState(item?.image ?? "");
  const [priceError, setPriceError] = useState<string>();
  const create = useMutation(trpc.menu.createItem.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.menu.updateItem.mutationOptions({ onSuccess: onSaved }));
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const noun = section.kind === "bar" ? "drink" : "dish";

  function save(event: React.FormEvent) {
    event.preventDefault();
    const priceCents = parseMenuPrice(price);
    if (priceCents === undefined) {
      setPriceError("Type the price in dollars, like 4 or 1.50 — or leave it empty to show “Ask”.");
      return;
    }
    setPriceError(undefined);
    const data = {
      name,
      description: description.trim() || null,
      priceCents,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
      image: image || null,
    };
    if (item) update.mutate({ id: item.id, ...data });
    else create.mutate({ sectionId: section.id, ...data });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : `New ${noun} in ${section.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondary}>Cancel</button>
          <button type="submit" form="menu-item-form" disabled={pending} className={primary}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {item ? "Save" : `Add ${noun}`}
          </button>
        </>
      }
    >
      <form id="menu-item-form" onSubmit={save} className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2">
          Name
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={section.kind === "bar" ? "Castle Lager" : "Full English breakfast"} className={field} />
        </label>
        <label className="text-sm">
          Price (USD)
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ask" className={field} />
        </label>
        {priceError && <p className="-mt-2 text-xs text-destructive sm:col-span-3">{priceError}</p>}
        <label className="text-sm sm:col-span-3">
          Description <span className="text-muted-foreground">(optional)</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Two eggs, bacon, sausage, grilled tomato and toast" className={field} />
        </label>
        <label className="text-sm sm:col-span-3">
          Labels <span className="text-muted-foreground">(optional, separated by commas)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Vegetarian, House favourite" className={field} />
        </label>
        <div className="sm:col-span-3">
          <ImageUpload label="Photo (optional)" value={image} onChange={setImage} folder={`menu/${propertySlug}`} />
        </div>
        {error && <p className="text-sm text-destructive sm:col-span-3">{friendlyError(error)}</p>}
      </form>
    </Modal>
  );
}
