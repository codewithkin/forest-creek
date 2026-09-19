"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Link2,
  RotateCcw,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ACCEPTED_IMAGE_TYPES,
  checkImageFile,
  resolveImage,
  useImageUpload,
} from "./use-image-upload";

/** Functional updates, so parallel uploads finishing together never drop a photo. */
export type GalleryUpdate = (update: (current: string[]) => string[]) => void;

type Pending = {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error?: string;
};

const PARALLEL_UPLOADS = 3;

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * The photo manager for a room or property gallery: drop or pick many files at
 * once, watch each upload, then drag (or use the arrows) to order them. The
 * first photo is the cover guests see on cards and in search.
 */
export default function GalleryUpload({
  value,
  onChange,
  folder,
  label = "Photos",
  max = 20,
  coverLabel = "Cover",
  hint,
  onBusyChange,
}: {
  value: string[];
  onChange: GalleryUpdate;
  folder: string;
  label?: string;
  max?: number;
  coverLabel?: string | null;
  hint?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, configured, checking } = useImageUpload(folder);
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState<string>();
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number>();
  const [url, setUrl] = useState("");

  const uploading = pending.some((item) => !item.error);
  useEffect(() => onBusyChange?.(uploading), [uploading, onBusyChange]);

  // Free the local previews when this unmounts.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((preview) => URL.revokeObjectURL(preview));
  }, []);

  const room = max - value.length - pending.length;

  function patch(id: string, change: Partial<Pending>) {
    setPending((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  function drop(id: string) {
    setPending((list) => {
      const gone = list.find((item) => item.id === id);
      if (gone) {
        URL.revokeObjectURL(gone.preview);
        previews.current.delete(gone.preview);
      }
      return list.filter((item) => item.id !== id);
    });
  }

  async function send(item: Pending) {
    patch(item.id, { error: undefined, progress: 0 });
    try {
      const publicUrl = await upload(item.file, (progress) => patch(item.id, { progress }));
      onChange((current) => [...current, publicUrl]);
      drop(item.id);
    } catch (cause) {
      patch(item.id, { error: cause instanceof Error ? cause.message : "Upload failed" });
    }
  }

  async function addFiles(list: FileList | File[]) {
    setNotice(undefined);
    const files = [...list];
    const problems: string[] = [];
    const accepted: Pending[] = [];

    for (const file of files) {
      const problem = checkImageFile(file);
      if (problem) {
        problems.push(problem);
        continue;
      }
      if (accepted.length >= room) {
        problems.push(`Only ${max} photos fit — ${files.length - accepted.length} skipped.`);
        break;
      }
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      accepted.push({ id: crypto.randomUUID(), file, preview, progress: 0 });
    }

    if (problems.length > 0) setNotice(problems.join(" "));
    if (accepted.length === 0) return;

    setPending((current) => [...current, ...accepted]);
    // A small pool: fast on good connections without flooding a weak one.
    const queue = [...accepted];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await send(item);
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker));
  }

  function addUrl() {
    const value = url.trim();
    if (!value) return;
    if (!/^(https?:\/\/|\/)/.test(value)) {
      setNotice("Paste a full link starting with https://");
      return;
    }
    if (room <= 0) {
      setNotice(`Only ${max} photos fit.`);
      return;
    }
    onChange((current) => (current.includes(value) ? current : [...current, value]));
    setUrl("");
    setNotice(undefined);
  }

  const reorder = (from: number, to: number) => onChange((current) => move(current, from, to));
  const iconButton =
    "flex size-7 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background hover:text-accent disabled:pointer-events-none disabled:opacity-30";

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {value.length} / {max} photos{uploading && " · uploading…"}
        </p>
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}

      {configured && (
        <div
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            setDragOver(false);
            void addFiles(event.dataTransfer.files);
          }}
          className={`mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors sm:flex-row sm:gap-4 sm:text-left ${
            dragOver ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
          } ${room <= 0 ? "pointer-events-none opacity-50" : ""}`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
            <UploadCloud className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 text-sm">
            <p>
              Drag photos here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                choose files
              </button>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select several at once · JPEG, PNG, WebP or AVIF · up to 8MB each
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files?.length) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {!configured && !checking && (
        <p className="mt-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Uploading needs Cloudflare R2 configured on the server. Until then, add photos by pasting
          their links below.
        </p>
      )}

      {notice && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      )}

      {(value.length > 0 || pending.length > 0) && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((image, index) => (
            <li
              key={image}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (dragIndex === undefined) return;
                event.preventDefault();
                if (dragIndex !== index) {
                  reorder(dragIndex, index);
                  setDragIndex(index);
                }
              }}
              onDragEnd={() => setDragIndex(undefined)}
              onDrop={(event) => event.preventDefault()}
              className={`group relative aspect-[4/3] cursor-grab overflow-hidden rounded-xl border bg-secondary active:cursor-grabbing ${
                dragIndex === index ? "border-accent opacity-60" : "border-border/70"
              } ${index === 0 && coverLabel ? "ring-2 ring-accent/70" : ""}`}
            >
              <img src={resolveImage(image)} alt="" className="h-full w-full object-cover" draggable={false} />

              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
                {index === 0 && coverLabel ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    <Star className="size-2.5 fill-current" aria-hidden />
                    {coverLabel}
                  </span>
                ) : (
                  <span className="rounded-full bg-background/85 px-2 py-0.5 text-[10px] tabular-nums backdrop-blur-sm">
                    {index + 1}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onChange((current) => current.filter((item) => item !== image))}
                  aria-label={`Remove photo ${index + 1}`}
                  className={`${iconButton} hover:text-destructive`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-6">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => reorder(index, index - 1)}
                    aria-label={`Move photo ${index + 1} earlier`}
                    className={iconButton}
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === value.length - 1}
                    onClick={() => reorder(index, index + 1)}
                    aria-label={`Move photo ${index + 1} later`}
                    className={iconButton}
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
                {index > 0 && coverLabel ? (
                  <button
                    type="button"
                    onClick={() => reorder(index, 0)}
                    className="rounded-full bg-background/85 px-2 py-1 text-[10px] font-medium backdrop-blur-sm transition-colors hover:text-accent"
                  >
                    Make {coverLabel.toLowerCase()}
                  </button>
                ) : (
                  <GripVertical className="size-4 text-white/70" aria-hidden />
                )}
              </div>
            </li>
          ))}

          {pending.map((item) => (
            <li
              key={item.id}
              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/70 bg-secondary"
            >
              <img src={item.preview} alt="" className="h-full w-full object-cover opacity-40" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                {item.error ? (
                  <>
                    <p className="line-clamp-3 text-[11px] text-destructive">{item.error}</p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void send(item)}
                        className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] hover:text-accent"
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => drop(item.id)}
                        aria-label="Discard this upload"
                        className="rounded-full bg-background/90 p-1.5 hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="max-w-full truncate text-[11px]">{item.file.name}</p>
                    <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-background/70">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200"
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {Math.round(item.progress * 100)}%
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}

          {configured && room > 0 && (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
              >
                <ImagePlus className="size-5" aria-hidden />
                Add more
              </button>
            </li>
          )}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              // Enter would otherwise submit the whole form.
              if (event.key === "Enter") {
                event.preventDefault();
                addUrl();
              }
            }}
            placeholder="or paste an image link"
            aria-label={`Add a ${label.toLowerCase()} link`}
            className="w-full rounded-lg border border-input bg-transparent py-2 pr-3 pl-8 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          />
        </div>
        <button
          type="button"
          onClick={addUrl}
          disabled={!url.trim()}
          className="shrink-0 rounded-lg border border-border px-3 text-xs transition-colors hover:border-accent/50 disabled:opacity-50"
        >
          Add link
        </button>
      </div>
    </div>
  );
}
