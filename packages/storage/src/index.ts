import { randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@forest-creek/env/server";
import { z } from "zod";

import { contentDisposition, fetchRemoteFile, safeFileName, type RemoteFile } from "./file-rules";

export * from "./file-rules";
export * from "./zip";

/** Only formats a browser can render, so a bad upload cannot poison a page. */
export const imageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

const extensions: Record<(typeof imageContentTypes)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const UPLOAD_URL_TTL_SECONDS = 300;

/** Lowercase, hyphenated path segments; "uploads" if nothing usable is left. */
export function toSafeFolder(raw: string): string {
  const segments = raw
    .toLowerCase()
    .split("/")
    .map((segment) =>
      segment
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);
  return segments.join("/").slice(0, 120).replace(/[/-]+$/, "") || "uploads";
}

export const uploadRequestSchema = z.object({
  contentType: z.enum(imageContentTypes),
  contentLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  // Groups objects in the bucket by what they illustrate. Built by the
  // dashboard from whatever slug is being typed ("properties/Forest Creek",
  // "activities/pool-"), so it is cleaned into safe path segments rather than
  // refused — refusing it made every photo upload fail mid-form.
  folder: z
    .string()
    .default("uploads")
    .transform(toSafeFolder),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export type UploadTarget = {
  /** Presigned PUT the browser sends the file straight to. */
  uploadUrl: string;
  /** Where the object will be readable once the PUT succeeds. */
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL.",
    );
    this.name = "StorageNotConfiguredError";
  }
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  /** Another S3-compatible store instead of R2 (a local MinIO, a test double). */
  endpoint?: string;
};

function readConfig(): R2Config | undefined {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET ||
    !R2_PUBLIC_URL
  ) {
    return undefined;
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicUrl: R2_PUBLIC_URL.replace(/\/$/, ""),
    endpoint: env.R2_ENDPOINT,
  };
}

export function isStorageConfigured(): boolean {
  return readConfig() !== undefined;
}

let client: S3Client | undefined;

function getClient(config: R2Config): S3Client {
  // R2 speaks S3, but only from a single "auto" region on the account endpoint.
  client ??= new S3Client({
    region: "auto",
    endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    // Other S3 stores take the bucket in the path, not the host name.
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

/**
 * Hands the browser a short-lived PUT it can upload straight to R2 with, so
 * image bytes never travel through the API process.
 */
export async function createUploadTarget(input: UploadRequest): Promise<UploadTarget> {
  const config = readConfig();
  if (!config) throw new StorageNotConfiguredError();

  const { contentType, contentLength, folder } = uploadRequestSchema.parse(input);
  const key = `${folder}/${randomUUID()}.${extensions[contentType]}`;

  const uploadUrl = await getSignedUrl(
    getClient(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
      // Signed into the URL, so an oversized body is rejected by R2 itself
      // rather than only by the browser we asked nicely.
      ContentLength: contentLength,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  return {
    uploadUrl,
    publicUrl: `${config.publicUrl}/${key}`,
    key,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}

/*
 * The document store: staff's own files, kept in the same bucket as the site's
 * photos. The bucket is public, so a file is protected by its key: 256 random
 * bits nobody can guess, never stored in a page or link. People only ever get
 * presigned URLs that die within minutes.
 */

const FILE_DOWNLOAD_TTL_SECONDS = 300;

/** Never guessable, never reused. */
export function newFileKey(name: string): string {
  return `files/${randomBytes(32).toString("hex")}/${safeFileName(name)}`;
}

function requireConfig(): R2Config {
  const config = readConfig();
  if (!config) throw new StorageNotConfiguredError();
  return config;
}

/** A presigned PUT for one file. Type and size are signed, so R2 refuses anything else. */
export async function createFileUploadUrl(key: string, contentType: string, contentLength: number): Promise<string> {
  const config = requireConfig();
  return getSignedUrl(
    getClient(config),
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

/** A link to one file that dies within minutes. */
export async function createFileDownloadUrl(
  key: string,
  name: string,
  options: { inline?: boolean; expiresIn?: number } = {},
): Promise<string> {
  const config = requireConfig();
  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(name, options.inline ?? false),
    }),
    { expiresIn: options.expiresIn ?? FILE_DOWNLOAD_TTL_SECONDS },
  );
}

/** The stored size in bytes, or undefined if the object isn't there. */
export async function storedFileSize(key: string): Promise<number | undefined> {
  const config = requireConfig();
  try {
    const head = await getClient(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return head.ContentLength;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return undefined;
    throw error;
  }
}

export async function deleteStoredFile(key: string): Promise<void> {
  const config = requireConfig();
  await getClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function putStoredFile(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const config = requireConfig();
  await getClient(config).send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: contentType }));
}

/** Fetches a link on the server, with real DNS and the safety checks in fetchRemoteFile. */
export function importRemoteFile(url: string): Promise<RemoteFile> {
  return fetchRemoteFile(url, {
    fetch,
    lookup: async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address),
  });
}
