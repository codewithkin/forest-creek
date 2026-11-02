"use client";

import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A file shared by link: a password if it has one, and a download button. */
export default function ShareDownload({
  token,
  file,
}: {
  token: string;
  file: { sizeBytes: number; needsPassword: boolean; closed: string | null };
}) {
  const [password, setPassword] = useState("");
  const download = useMutation(
    trpc.files.shareDownload.mutationOptions({
      onSuccess: ({ url }) => window.location.assign(url),
    }),
  );

  if (file.closed) return <p className="text-muted-foreground">{file.closed}</p>;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        download.mutate({ token, password: password || undefined });
      }}
      className="space-y-4"
    >
      <p className="text-sm text-muted-foreground">{size(file.sizeBytes)}</p>
      {file.needsPassword && (
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          />
        </label>
      )}
      {download.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(download.error)}
        </p>
      )}
      <button type="submit" disabled={download.isPending} className={buttonClass({ shape: "pill", size: "lg" })}>
        {download.isPending ? <Spinner /> : <Download aria-hidden />}
        Download
      </button>
    </form>
  );
}
