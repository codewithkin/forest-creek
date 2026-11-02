"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { DoneStep, StepModal } from "./ui/steps";
import { Dropzone, FileTypeIcon, formatBytes, UploadRow } from "./ui/upload";
import { useFileUpload, type FilePlace } from "./use-file-upload";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "choose", label: "Choose" },
  { key: "details", label: "Details" },
  { key: "upload", label: "Upload" },
  { key: "done", label: "Done" },
] as const;

/**
 * Adds files in four steps: pick them (or paste a link), say where they go,
 * watch them upload, done. `place` fixes where they go (a folder, a booking,
 * a quotation); at the top level staff choose the property, and the owner can
 * keep them for the whole group.
 */
export function UploadModal({ place, onClose }: { place: FilePlace; onClose: () => void }) {
  const { properties, selectedId } = useProperties();
  const status = useQuery(trpc.files.status.queryOptions());
  const queryClient = useQueryClient();
  const placed = Boolean(place.folderId || place.bookingId || place.quoteId);
  const [step, setStep] = useState(0);
  const [staged, setStaged] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [propertyId, setPropertyId] = useState(selectedId ?? (status.data?.canUseGroup ? "" : (properties[0]?.id ?? "")));
  const [description, setDescription] = useState("");

  const target: FilePlace = placed ? place : { propertyId: propertyId || undefined };
  const { items, add, cancel, retry, busy } = useFileUpload(target, description || undefined);

  const importUrl = useMutation(
    trpc.files.importUrl.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
    }),
  );

  const link = showLink ? url.trim() : "";
  const chosen = staged.length > 0 || Boolean(link);

  function begin() {
    if (staged.length) add(staged);
    if (link) importUrl.mutate({ ...target, url: link, description: description || undefined });
    setStep(2);
  }

  const failed = items.filter((item) => item.state === "failed").length + (importUrl.isError ? 1 : 0);
  const working = busy || importUrl.isPending;
  const done = items.filter((item) => item.state === "done").length + (importUrl.isSuccess ? 1 : 0);

  // Everything went: straight on to Done. A failure waits for a retry or a choice.
  useEffect(() => {
    if (step === 2 && !working && done > 0 && failed === 0) {
      const timer = setTimeout(() => setStep(3), 500);
      return () => clearTimeout(timer);
    }
  }, [step, working, done, failed]);

  function startOver() {
    setStaged([]);
    setUrl("");
    setShowLink(false);
    importUrl.reset();
    setStep(0);
  }

  const next =
    step === 0
      ? { label: "Next", onClick: () => setStep(1), disabled: !chosen }
      : step === 1
        ? { label: staged.length + (link ? 1 : 0) > 1 ? `Upload ${staged.length + (link ? 1 : 0)} files` : "Upload", onClick: begin, icon: <Upload aria-hidden /> }
        : step === 2
          ? { label: working ? "Uploading…" : "Finish", onClick: () => setStep(3), disabled: working || done === 0, pending: working }
          : undefined;

  return (
    <StepModal
      title="Upload files"
      description="PDF, Word, Excel, images and MP4, up to 50 MB each."
      icon={<Upload className="size-4" />}
      size="md"
      steps={steps}
      current={step}
      onClose={onClose}
      onBack={step === 1 ? () => setStep(0) : undefined}
      next={next}
      aside={step === 2 && working ? <span className="text-xs text-muted-foreground">Keep this open until it finishes</span> : undefined}
    >
      {step === 0 && (
        <div className="space-y-4">
          <Dropzone onFiles={(files) => setStaged((current) => [...current, ...files])} hint="Drop them here, or browse." />
          {staged.length > 0 && (
            <ul className="space-y-2">
              {staged.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex animate-rise-in items-center gap-3 rounded-2xl border border-border/60 px-3 py-2">
                  <FileTypeIcon type={file.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{file.name}</span>
                    <span className={`block text-xs ${file.size > 50 * 1024 * 1024 ? "text-rose-300" : "text-muted-foreground"}`}>
                      {formatBytes(file.size)}
                      {file.size > 50 * 1024 * 1024 ? " · over the 50 MB limit" : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setStaged((current) => current.filter((_, at) => at !== index))}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showLink ? (
            <label className="block animate-rise-in text-xs">
              Link to a file
              <span className="relative mt-1 block">
                <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="url"
                  autoFocus
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://"
                  className="w-full rounded-xl border border-input bg-transparent py-2.5 pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </span>
            </label>
          ) : (
            <button type="button" onClick={() => setShowLink(true)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Plus className="size-3.5" aria-hidden />
              Add from a link instead
            </button>
          )}
        </div>
      )}

      {step === 1 && (
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
          <label className="block text-xs">
            Description <span className="text-muted-foreground">(optional)</span>
            <input autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Signed contract, March invoices…" className={inputClass} />
          </label>
          <p className="rounded-2xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            {staged.length > 0 && `${staged.length} ${staged.length === 1 ? "file" : "files"}, ${formatBytes(staged.reduce((sum, file) => sum + file.size, 0))}`}
            {staged.length > 0 && link ? " and " : ""}
            {link && "1 link"}
            {placed ? ", attached here." : "."}
          </p>
        </div>
      )}

      {step === 2 && (
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
          {link && (
            <li className="flex items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 text-sm">
              <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{link}</span>
              {importUrl.isPending && <Spinner />}
              {importUrl.isSuccess && <span className="text-xs text-emerald-300">Imported</span>}
              {importUrl.isError && (
                <span className="flex items-center gap-2 text-xs text-rose-300">
                  {friendlyError(importUrl.error)}
                  <button
                    type="button"
                    onClick={() => importUrl.mutate({ ...target, url: link, description: description || undefined })}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    Retry
                  </button>
                </span>
              )}
            </li>
          )}
        </ul>
      )}

      {step === 3 && (
        <DoneStep
          title={failed > 0 ? `${done} uploaded, ${failed} didn't` : done === 1 ? "File uploaded" : `${done} files uploaded`}
          actions={
            <>
              <button type="button" onClick={startOver} className={buttonClass({ variant: "ghost", shape: "pill" })}>
                <Plus aria-hidden />
                Upload more
              </button>
              <button type="button" onClick={onClose} className={buttonClass({ shape: "pill" })}>
                Done
              </button>
            </>
          }
        >
          {placed ? "They're attached and ready to share." : "They're in your files, ready to preview or share."}
        </DoneStep>
      )}
    </StepModal>
  );
}
