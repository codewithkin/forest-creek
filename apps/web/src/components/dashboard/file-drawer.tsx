"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Link2, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { Drawer } from "./ui/overlay";
import { FileTypeIcon, formatBytes } from "./ui/upload";

const inputClass =
  "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

export type FileRow = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  description: string | null;
  folderId: string | null;
  propertyId: string | null;
  deletedAt: string | null;
  uploadedBy: string;
  createdAt: string;
};

const previewable = (type: string) => type === "application/pdf" || type.startsWith("image/") || type === "video/mp4";

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One file: preview, details, moving it, sharing it, and the trash. */
export function FileDrawer({ file, onClose }: { file?: FileRow; onClose: () => void }) {
  return (
    <Drawer open={Boolean(file)} onClose={onClose} title={file?.name ?? "File"} description={file ? `${formatBytes(file.sizeBytes)} · ${day(file.createdAt)}` : undefined}>
      {file && <Body key={file.id} file={file} onClose={onClose} />}
    </Drawer>
  );
}

function Body({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(file.name);
  const [description, setDescription] = useState(file.description ?? "");
  const [folderId, setFolderId] = useState(file.folderId ?? "");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const trashed = Boolean(file.deletedAt);

  const folders = useQuery(trpc.files.allFolders.queryOptions({ propertyId: file.propertyId ?? undefined }));
  const after = (message: string, close = false) => ({
    onSuccess: async () => {
      toast.success(message);
      await queryClient.invalidateQueries();
      if (close) onClose();
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  });
  const update = useMutation(trpc.files.update.mutationOptions(after("Saved")));
  const trash = useMutation(trpc.files.trash.mutationOptions(after("Moved to the trash", true)));
  const restore = useMutation(trpc.files.restore.mutationOptions(after("Restored", true)));
  const link = useMutation(trpc.files.link.mutationOptions());

  // A short-lived link, fetched when the drawer opens, so nothing lasting is in the page.
  const canPreview = previewable(file.contentType) && !trashed;
  const { mutate: requestLink } = link;
  useEffect(() => {
    if (!canPreview) return;
    requestLink({ id: file.id, preview: true }, { onSuccess: ({ url }) => setPreviewUrl(url) });
  }, [canPreview, file.id, requestLink]);

  async function open(preview: boolean) {
    try {
      const { url } = await link.mutateAsync({ id: file.id, preview });
      if (preview) window.open(url, "_blank", "noopener");
      else window.location.assign(url);
    } catch (error) {
      toast.error(friendlyError(error as Error));
    }
  }

  return (
    <div className="space-y-5">
      {canPreview && (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          {!previewUrl ? (
            <div className="h-48 animate-pulse bg-secondary" />
          ) : file.contentType.startsWith("image/") ? (
            <img src={previewUrl} alt={file.name} className="max-h-80 w-full object-contain" />
          ) : file.contentType === "video/mp4" ? (
            <video src={previewUrl} controls className="max-h-80 w-full" />
          ) : (
            <iframe src={previewUrl} title={file.name} className="h-80 w-full bg-white" />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!trashed && (
          <>
            <button type="button" disabled={link.isPending} onClick={() => void open(false)} className={buttonClass({ size: "sm" })}>
              <Download aria-hidden />
              Download
            </button>
            {canPreview && (
              <button type="button" onClick={() => void open(true)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <ExternalLink aria-hidden />
                Open
              </button>
            )}
            <button type="button" disabled={trash.isPending} onClick={() => trash.mutate(file.id)} className={buttonClass({ variant: "ghost", size: "sm" })}>
              <Trash2 aria-hidden />
              Delete
            </button>
          </>
        )}
        {trashed && (
          <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(file.id)} className={buttonClass({ size: "sm" })}>
            <RotateCcw aria-hidden />
            Restore
          </button>
        )}
      </div>

      {trashed && <p className="text-sm text-muted-foreground">In the trash. It will be removed for good 30 days after it was deleted.</p>}

      {!trashed && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ id: file.id, name, description, folderId: folderId || null });
          }}
          className="space-y-3 rounded-2xl border border-border/60 p-4"
        >
          <label className="block text-xs">
            Name
            <input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs">
            Description
            <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs">
            Folder
            <select value={folderId} onChange={(event) => setFolderId(event.target.value)} className={inputClass}>
              <option value="" className="bg-popover">
                Top level
              </option>
              {folders.data?.filter((folder) => folder.propertyId === file.propertyId).map((folder) => (
                <option key={folder.id} value={folder.id} className="bg-popover">
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={update.isPending} className={buttonClass({ variant: "secondary", size: "sm" })}>
            {update.isPending ? <Spinner /> : <Save aria-hidden />}
            Save
          </button>
        </form>
      )}

      {!trashed && <Shares fileId={file.id} />}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileTypeIcon type={file.contentType} className="size-4" />
        Uploaded by {file.uploadedBy}
      </p>
    </div>
  );
}

function Shares({ fileId }: { fileId: string }) {
  const queryClient = useQueryClient();
  const shares = useQuery(trpc.files.shares.queryOptions(fileId));
  const [days, setDays] = useState("7");
  const [password, setPassword] = useState("");
  const [limit, setLimit] = useState("");

  const copy = (token: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}/f/${token}`).then(() => toast.success("Link copied"));
  };

  const create = useMutation(
    trpc.files.createShare.mutationOptions({
      onSuccess: async (share) => {
        copy(share.token);
        setPassword("");
        setLimit("");
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );
  const revoke = useMutation(
    trpc.files.revokeShare.mutationOptions({
      onSuccess: async () => {
        toast.success("Link turned off");
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  return (
    <section className="rounded-2xl border border-border/60 p-4">
      <h3 className="font-display text-lg">Share with a link</h3>
      <p className="text-xs text-muted-foreground">For someone without a login. Anyone with the link can open it.</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            fileId,
            expiresInDays: days ? Number(days) : undefined,
            password: password || undefined,
            maxDownloads: limit ? Number(limit) : undefined,
          });
        }}
        className="mt-3 grid gap-3 sm:grid-cols-3"
      >
        <label className="text-xs">
          Expires
          <select value={days} onChange={(event) => setDays(event.target.value)} className={inputClass}>
            <option value="1" className="bg-popover">In 1 day</option>
            <option value="7" className="bg-popover">In 7 days</option>
            <option value="30" className="bg-popover">In 30 days</option>
            <option value="" className="bg-popover">Never</option>
          </select>
        </label>
        <label className="text-xs">
          Password (optional)
          <input type="text" minLength={4} autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
        </label>
        <label className="text-xs">
          Max downloads
          <input type="number" min={1} value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="No limit" className={inputClass} />
        </label>
        <button type="submit" disabled={create.isPending} className={buttonClass({ variant: "secondary", size: "sm", className: "sm:col-span-3 sm:justify-self-start" })}>
          {create.isPending ? <Spinner /> : <Link2 aria-hidden />}
          Create link and copy
        </button>
      </form>

      {(shares.data?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {shares.data?.map((share) => (
            <li key={share.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {share.expiresAt ? `Until ${day(share.expiresAt)}` : "No expiry"}
                {share.hasPassword ? " · password" : ""} · {share.downloads}
                {share.maxDownloads ? ` of ${share.maxDownloads}` : ""} downloads
              </span>
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => copy(share.token)} aria-label="Copy link" className="rounded-full p-1.5 hover:text-foreground">
                  <Copy className="size-3.5" />
                </button>
                <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(share.id)} aria-label="Turn off link" className="rounded-full p-1.5 hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
