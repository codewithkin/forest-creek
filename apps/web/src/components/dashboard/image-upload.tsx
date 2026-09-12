"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { mediaUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** Seed images are API-relative paths; uploads are absolute R2 URLs. */
export function resolveImage(value: string): string {
  return value.startsWith("http") ? value : mediaUrl(value);
}

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

  const status = useQuery(trpc.uploads.status.queryOptions());
  const createUrl = useMutation(trpc.uploads.createUploadUrl.mutationOptions());

  const configured = status.data?.configured ?? false;

  async function upload(file: File) {
    setError(undefined);

    if (!(ACCEPTED as readonly string[]).includes(file.type)) {
      setError("Use a JPEG, PNG, WebP or AVIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
      return;
    }

    setUploading(true);
    try {
      const target = await createUrl.mutateAsync({
        contentType: file.type as (typeof ACCEPTED)[number],
        contentLength: file.size,
        folder,
      });

      // Straight to R2; the bytes never touch our API.
      const response = await fetch(target.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!response.ok) {
        throw new Error(`Upload rejected by storage (${response.status})`);
      }
      onChange(target.publicUrl);
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
            accept={ACCEPTED.join(",")}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
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

          {!configured && !status.isPending && (
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
