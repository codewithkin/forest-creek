"use client";

import { useQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { trpc } from "@/utils/trpc";

import { FileDrawer, type FileRow } from "./file-drawer";
import { FileTypeIcon, formatBytes } from "./ui/upload";
import { UploadModal } from "./upload-modal";

/** The files attached to a booking or a quotation: an ID copy, a contract, a bank slip. */
export function DocumentList({ bookingId, quoteId }: { bookingId?: string; quoteId?: string }) {
  const status = useQuery(trpc.files.status.queryOptions());
  const documents = useQuery({
    ...trpc.files.list.queryOptions({ bookingId, quoteId }),
    enabled: Boolean(status.data?.configured),
  });
  const [openId, setOpenId] = useState<string>();
  const [uploading, setUploading] = useState(false);

  if (!status.data?.configured) return null;
  const rows = documents.data as FileRow[] | undefined;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg">Documents</h3>
        <button type="button" onClick={() => setUploading(true)} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <Paperclip aria-hidden />
          Attach
        </button>
      </div>
      {rows?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing attached yet.</p>}
      {(rows?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-2">
          {rows?.map((file) => (
            <li key={file.id}>
              <button type="button" onClick={() => setOpenId(file.id)} className="flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-2 text-left hover:bg-secondary/60">
                <FileTypeIcon type={file.contentType} />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FileDrawer file={rows?.find((file) => file.id === openId)} onClose={() => setOpenId(undefined)} />
      {uploading && <UploadModal place={{ bookingId, quoteId }} onClose={() => setUploading(false)} />}
    </section>
  );
}
