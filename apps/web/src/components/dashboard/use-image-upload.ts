"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { mediaUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

type AcceptedType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Seed images are API-relative paths; uploads are absolute R2 URLs. */
export function resolveImage(value: string): string {
  return value.startsWith("http") ? value : mediaUrl(value);
}

/** A sentence a manager can act on, or undefined when the file is fine to send. */
export function checkImageFile(file: File): string | undefined {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name}: use a JPEG, PNG, WebP or AVIF image.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`;
  }
  return undefined;
}

/** PUT with progress events, which fetch cannot report for uploads. */
function putWithProgress(url: string, file: File, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(file);
  });
}

/**
 * Uploads one image straight to R2 through a presigned PUT; the bytes never
 * touch our API. Shared by the single-image and gallery pickers.
 */
export function useImageUpload(folder: string) {
  const status = useQuery(trpc.uploads.status.queryOptions());
  const createUrl = useMutation(trpc.uploads.createUploadUrl.mutationOptions());

  async function upload(file: File, onProgress?: (fraction: number) => void): Promise<string> {
    const problem = checkImageFile(file);
    if (problem) throw new Error(problem);

    const target = await createUrl.mutateAsync({
      contentType: file.type as AcceptedType,
      contentLength: file.size,
      folder,
    });
    await putWithProgress(target.uploadUrl, file, onProgress);
    return target.publicUrl;
  }

  return {
    upload,
    configured: status.data?.configured ?? false,
    checking: status.isPending,
  };
}
