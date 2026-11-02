"use client";

import { CheckCircle2, CloudUpload, File as FileIcon, FileImage, FileSpreadsheet, FileText, FileVideo, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 KB";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileTypeIcon({ type, className = "size-5" }: { type: string; className?: string }) {
  if (type.startsWith("image/")) return <FileImage className={`${className} text-emerald-300`} aria-hidden />;
  if (type.startsWith("video/")) return <FileVideo className={`${className} text-violet-300`} aria-hidden />;
  if (type === "application/pdf") return <FileText className={`${className} text-rose-300`} aria-hidden />;
  if (type.includes("sheet") || type.includes("excel") || type === "text/csv") return <FileSpreadsheet className={`${className} text-teal-300`} aria-hidden />;
  if (type.includes("word") || type.includes("presentation") || type.includes("powerpoint") || type === "text/plain") return <FileText className={`${className} text-sky-300`} aria-hidden />;
  return <FileIcon className={`${className} text-muted-foreground`} aria-hidden />;
}

/** The dashed drop area: drag files in, or browse. */
export function Dropzone({ onFiles, disabled, hint }: { onFiles: (files: File[]) => void; disabled?: boolean; hint: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) onFiles([...event.dataTransfer.files]);
      }}
      className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
        over ? "border-accent bg-accent/10" : "border-border/80 bg-card/60"
      }`}
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-border/70">
        <CloudUpload className="size-5 text-accent" aria-hidden />
      </span>
      <p className="mt-4 font-medium">Choose a file or drag &amp; drop it here</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={buttonClass({ shape: "pill", className: "mt-4" })}>
        Browse files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/** One upload: name, size, a thin progress bar, and what can be done about it. */
export function UploadRow({
  name,
  type,
  size,
  progress,
  state,
  error,
  onCancel,
  onRetry,
}: {
  name: string;
  type: string;
  size: number;
  progress: number;
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const percent = Math.round(progress * 100);
  return (
    <li className="rounded-2xl border border-border/60 bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <FileTypeIcon type={type} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {state === "uploading" && (
              <>
                {formatBytes(size * progress)} of {formatBytes(size)} <Spinner /> Uploading…
              </>
            )}
            {state === "waiting" && `${formatBytes(size)} · waiting`}
            {state === "done" && (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-300" aria-hidden /> Uploaded · {formatBytes(size)}
              </>
            )}
            {state === "failed" && <span className="text-rose-300">{error ?? "It didn't upload"}</span>}
          </p>
        </div>
        {state === "failed" && (
          <button type="button" onClick={onRetry} aria-label={`Retry ${name}`} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground">
            <RotateCcw className="size-4" />
          </button>
        )}
        {state !== "done" && (
          <button type="button" onClick={onCancel} aria-label={`Cancel ${name}`} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
      {(state === "uploading" || state === "waiting") && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${name}`}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </li>
  );
}
