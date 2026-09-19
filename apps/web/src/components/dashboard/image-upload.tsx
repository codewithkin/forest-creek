"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { ACCEPTED_IMAGE_TYPES, resolveImage, useImageUpload } from "./use-image-upload";

export { resolveImage };

/** One image, e.g. a property's hero. Galleries use GalleryUpload. */
export default function ImageUpload({
  value,
  onChange,
  label,
  folder,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  folder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const { upload, configured, checking } = useImageUpload(folder);

  async function send(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      onChange(await upload(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>

      <div className="mt-2 flex items-start gap-4">
        <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-secondary">
          {value ? (
            <>
              <img src={resolveImage(value)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange("")}
                aria-label="Remove image"
                className="absolute top-1 right-1 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void send(file);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            disabled={!configured || uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-accent/50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
          </button>

          {!configured && !checking && (
            <p className="mt-2 text-xs text-muted-foreground">
              Image uploads need Cloudflare R2 configured on the server. You can still paste an
              image URL below.
            </p>
          )}

          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="or paste an image URL"
            aria-label={`${label} URL`}
            className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          />

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
