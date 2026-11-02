"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { Modal } from "./ui/overlay";
import { Dropzone, UploadRow } from "./ui/upload";
import { useFileUpload, type FilePlace } from "./use-file-upload";

const inputClass =
  "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

/**
 * Adds files: dragged in, browsed for, or fetched from a link. `place` fixes
 * where they go (a folder, a booking, a quotation); at the top level staff
 * choose the property, and the owner can keep them for the whole group.
 */
export function UploadModal({ place, onClose }: { place: FilePlace; onClose: () => void }) {
  const { properties, selectedId } = useProperties();
  const status = useQuery(trpc.files.status.queryOptions());
  const queryClient = useQueryClient();
  const placed = Boolean(place.folderId || place.bookingId || place.quoteId);
  const [propertyId, setPropertyId] = useState(selectedId ?? (status.data?.canUseGroup ? "" : (properties[0]?.id ?? "")));
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const target: FilePlace = placed ? place : { propertyId: propertyId || undefined };
  const { items, add, cancel, retry, busy } = useFileUpload(target, description || undefined);

  const importUrl = useMutation(
    trpc.files.importUrl.mutationOptions({
      onSuccess: async () => {
        toast.success("Imported");
        setUrl("");
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={<Upload className="size-4" />}
      title="Upload files"
      description="Choose files or add a link to one."
      footer={
        <button type="button" onClick={onClose} className={buttonClass({ variant: busy ? "ghost" : "primary", shape: "pill" })}>
          {busy ? "Close, uploads will stop" : "Done"}
        </button>
      }
    >
      <div className="space-y-4">
        {!placed && (
          <label className="block text-xs">
            Keep under
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={inputClass}>
              {status.data?.canUseGroup && (
                <option value="" className="bg-popover">
                  The whole group (only the owner sees these)
                </option>
              )}
              {properties.map((property) => (
                <option key={property.id} value={property.id} className="bg-popover">
                  {property.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <Dropzone onFiles={add} hint="PDF, Word, Excel, images and MP4, up to 50 MB each." />

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <UploadRow
                key={item.id}
                name={item.file.name}
                type={item.file.type}
                size={item.file.size}
                progress={item.progress}
                state={item.state}
                error={item.error}
                onCancel={() => cancel(item.id)}
                onRetry={() => retry(item.id)}
              />
            ))}
          </ul>
        )}

        <label className="block text-xs">
          Description (optional)
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Applies to the files you add next" className={inputClass} />
        </label>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border/70" />
          or
          <span className="h-px flex-1 bg-border/70" />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            importUrl.mutate({ ...target, url, description: description || undefined });
          }}
        >
          <label className="block text-xs">
            Import from a link
            <div className="mt-1 flex gap-2">
              <span className="relative flex-1">
                <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://"
                  className="w-full rounded-lg border border-input bg-transparent py-2 pr-3 pl-9 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
                />
              </span>
              <button type="submit" disabled={importUrl.isPending || !url} className={buttonClass({ variant: "secondary" })}>
                {importUrl.isPending && <Spinner />}
                Import
              </button>
            </div>
          </label>
        </form>
      </div>
    </Modal>
  );
}
