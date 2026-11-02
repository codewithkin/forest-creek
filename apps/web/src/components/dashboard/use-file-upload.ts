"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

/** Where uploaded files go. */
export type FilePlace = { folderId?: string; propertyId?: string; bookingId?: string; quoteId?: string };

export type UploadItem = {
  id: string;
  file: File;
  /** Where this one goes when it isn't the hook's own place: a folder made for a folder upload. */
  folderId?: string;
  /** 0 to 1. */
  progress: number;
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
};

/** A few at a time: a phone on a lodge's connection shouldn't send twenty at once. */
const AT_ONCE = 3;

const MAX_BYTES = 50 * 1024 * 1024;

function put(url: string, file: File, contentType: string, onProgress: (fraction: number) => void, onXhr: (xhr: XMLHttpRequest) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhr(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The file store refused it (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    xhr.send(file);
  });
}

/**
 * A queue of uploads, each straight to R2: ask for a signed PUT, send it with
 * progress, confirm it. Failures stay in the list with a Retry; one failing
 * never stops the rest.
 */
export function useFileUpload(place: FilePlace, description?: string) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  // Which items have been sent: an effect may run again before the state settles.
  const sent = useRef(new Set<string>());
  const queryClient = useQueryClient();
  const start = useMutation(trpc.files.startUpload.mutationOptions());
  const finish = useMutation(trpc.files.finishUpload.mutationOptions());

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  const send = useCallback(
    async (item: UploadItem) => {
      patch(item.id, { state: "uploading", progress: 0, error: undefined });
      try {
        const target = await start.mutateAsync({
          name: item.file.name,
          contentType: item.file.type || "application/octet-stream",
          sizeBytes: item.file.size,
          description,
          ...place,
          ...(item.folderId ? { folderId: item.folderId, propertyId: undefined } : {}),
        });
        await put(
          target.uploadUrl,
          item.file,
          target.contentType,
          (progress) => patch(item.id, { progress }),
          (xhr) => xhrs.current.set(item.id, xhr),
        );
        await finish.mutateAsync(target.fileId);
        patch(item.id, { state: "done", progress: 1 });
        await queryClient.invalidateQueries();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setItems((current) => current.filter((candidate) => candidate.id !== item.id));
          return;
        }
        patch(item.id, { state: "failed", error: friendlyError(error as Error) });
      } finally {
        xhrs.current.delete(item.id);
      }
    },
    [description, finish, patch, place, queryClient, start],
  );

  // Starts what's waiting, keeping to the limit.
  useEffect(() => {
    const active = items.filter((item) => item.state === "uploading").length;
    for (const item of items.filter((candidate) => candidate.state === "waiting").slice(0, Math.max(0, AT_ONCE - active))) {
      if (sent.current.has(item.id)) continue;
      sent.current.add(item.id);
      void send(item);
    }
  }, [items, send]);

  const add = useCallback((files: (File | { file: File; folderId?: string })[]) => {
    setItems((current) => [
      ...current,
      ...files.map((entry): UploadItem => {
        const { file, folderId } = entry instanceof File ? { file: entry, folderId: undefined } : entry;
        const problem = file.size > MAX_BYTES ? "Larger than the 50 MB limit" : file.size === 0 ? "This file is empty" : undefined;
        return {
          id: crypto.randomUUID(),
          file,
          folderId,
          progress: 0,
          state: problem ? "failed" : "waiting",
          error: problem,
        };
      }),
    ]);
  }, []);

  const cancel = useCallback((id: string) => {
    const xhr = xhrs.current.get(id);
    if (xhr) xhr.abort();
    else setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const retry = useCallback(
    (id: string) => {
      sent.current.delete(id);
      patch(id, { state: "waiting", error: undefined, progress: 0 });
    },
    [patch],
  );

  return { items, add, cancel, retry, busy: items.some((item) => item.state === "waiting" || item.state === "uploading") };
}
