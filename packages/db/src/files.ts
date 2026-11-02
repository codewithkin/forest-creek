import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { prisma } from "./client";

import type { FileShare, Prisma, StoredFile } from "../prisma/generated/client";

/**
 * The document store's records. The bytes live in R2 (packages/storage), which
 * packages/api calls; everything here is about what exists and who may see it.
 *
 * Scope: `undefined` is the owner, who sees everything. A manager passes their
 * property ids and sees those properties' files, never group-wide ones.
 */

export type FileScope = string[] | undefined;

export class FileError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "FileError";
  }
}

/** How long the trash keeps a file before it is gone for good. */
export const TRASH_DAYS = 30;
/** An upload never confirmed after this long was abandoned. */
const ABANDONED_UPLOAD_HOURS = 24;
const HOUR = 3_600_000;

const propertyScope = (scope: FileScope): Prisma.StoredFileWhereInput => (scope ? { propertyId: { in: scope } } : {});

function assertInScope(scope: FileScope, propertyId: string | null): void {
  if (scope && (propertyId === null || !scope.includes(propertyId))) {
    throw new FileError("That belongs to another property", "FORBIDDEN");
  }
}

async function loadFile(id: string, scope: FileScope): Promise<StoredFile> {
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) throw new FileError("No such file", "NOT_FOUND");
  assertInScope(scope, file.propertyId);
  return file;
}

export const startFileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  description: z.string().trim().max(500).optional(),
  folderId: z.string().min(1).optional(),
  /** Unset is group-wide, which only the owner may use. */
  propertyId: z.string().min(1).optional(),
  bookingId: z.string().min(1).optional(),
  quoteId: z.string().min(1).optional(),
});

export type StartFileInput = z.infer<typeof startFileSchema>;

/** Checks where a new file is going, and that it can go there. */
async function placeFile(input: Pick<StartFileInput, "folderId" | "propertyId" | "bookingId" | "quoteId">, scope: FileScope) {
  let propertyId = input.propertyId ?? null;
  if (input.folderId) {
    const folder = await prisma.fileFolder.findUnique({ where: { id: input.folderId } });
    if (!folder) throw new FileError("That folder no longer exists", "NOT_FOUND");
    propertyId = folder.propertyId;
  }
  if (input.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: input.bookingId }, select: { propertyId: true } });
    if (!booking) throw new FileError("No such booking", "NOT_FOUND");
    propertyId = booking.propertyId;
  }
  if (input.quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: input.quoteId }, select: { propertyId: true } });
    if (!quote) throw new FileError("No such quotation", "NOT_FOUND");
    propertyId = quote.propertyId;
  }
  assertInScope(scope, propertyId);
  return propertyId;
}

/** Records an upload about to happen. It stays invisible until confirmed. */
export async function createPendingFile(input: StartFileInput & { key: string }, scope: FileScope, by: string): Promise<StoredFile> {
  const propertyId = await placeFile(input, scope);
  return prisma.storedFile.create({
    data: {
      key: input.key,
      name: input.name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      description: input.description,
      folderId: input.folderId,
      propertyId,
      bookingId: input.bookingId,
      quoteId: input.quoteId,
      uploadedBy: by,
    },
  });
}

/** A file already in R2 (a server-side import): visible at once. */
export async function createReadyFile(input: StartFileInput & { key: string }, scope: FileScope, by: string): Promise<StoredFile> {
  const file = await createPendingFile(input, scope, by);
  return prisma.storedFile.update({ where: { id: file.id }, data: { status: "ready" } });
}

export async function getPendingFile(id: string, scope: FileScope): Promise<StoredFile> {
  const file = await loadFile(id, scope);
  if (file.status !== "pending") throw new FileError("That upload is already finished", "CONFLICT");
  return file;
}

export function markFileReady(id: string): Promise<StoredFile> {
  return prisma.storedFile.update({ where: { id }, data: { status: "ready" } });
}

export const listFilesSchema = z.object({
  /** undefined: everything in scope (a search). null: the top level. */
  folderId: z.string().min(1).nullable().optional(),
  propertyId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  kind: z.enum(["all", "documents", "images", "video", "trash"]).default("all"),
  bookingId: z.string().min(1).optional(),
  quoteId: z.string().min(1).optional(),
});

export type ListFilesInput = z.input<typeof listFilesSchema>;

const KIND_WHERE: Record<string, Prisma.StoredFileWhereInput> = {
  images: { contentType: { startsWith: "image/" } },
  video: { contentType: { startsWith: "video/" } },
  documents: { NOT: [{ contentType: { startsWith: "image/" } }, { contentType: { startsWith: "video/" } }] },
};

/** Never returns the key: it is the file's secret. */
const FILE_FIELDS = {
  id: true,
  name: true,
  contentType: true,
  sizeBytes: true,
  description: true,
  folderId: true,
  propertyId: true,
  bookingId: true,
  quoteId: true,
  deletedAt: true,
  uploadedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listFiles(input: ListFilesInput, scope: FileScope) {
  const { folderId, propertyId, search, kind, bookingId, quoteId } = listFilesSchema.parse(input);
  const trash = kind === "trash";
  const searching = Boolean(search) || trash || Boolean(bookingId) || Boolean(quoteId);
  return prisma.storedFile.findMany({
    where: {
      ...propertyScope(scope),
      ...(propertyId ? { AND: [{ propertyId }] } : {}),
      status: "ready",
      deletedAt: trash ? { not: null } : null,
      ...(searching ? {} : { folderId: folderId === undefined ? undefined : folderId }),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      bookingId,
      quoteId,
      ...(KIND_WHERE[kind] ?? {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: FILE_FIELDS,
  });
}

const folderScope = (scope: FileScope): Prisma.FileFolderWhereInput => (scope ? { propertyId: { in: scope } } : {});

export async function listFolders(parentId: string | null, scope: FileScope, propertyId?: string) {
  return prisma.fileFolder.findMany({
    where: { parentId, ...folderScope(scope), ...(propertyId ? { AND: [{ propertyId }] } : {}) },
    orderBy: { name: "asc" },
    include: { _count: { select: { files: { where: { status: "ready", deletedAt: null } }, children: true } } },
  });
}

/** Every folder in scope, for "move to". */
export function listAllFolders(scope: FileScope, propertyId?: string) {
  return prisma.fileFolder.findMany({
    where: { ...folderScope(scope), ...(propertyId ? { AND: [{ propertyId }] } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true, propertyId: true },
  });
}

/** The trail from the top level down to a folder, for the breadcrumb. */
export async function folderPath(id: string, scope: FileScope): Promise<{ id: string; name: string }[]> {
  const path: { id: string; name: string }[] = [];
  for (let current: string | null = id, depth = 0; current && depth < 20; depth++) {
    const folder: { id: string; name: string; parentId: string | null; propertyId: string | null } | null = await prisma.fileFolder.findUnique({
      where: { id: current },
      select: { id: true, name: true, parentId: true, propertyId: true },
    });
    if (!folder) break;
    assertInScope(scope, folder.propertyId);
    path.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return path;
}

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
});

export async function createFolder(input: z.infer<typeof createFolderSchema>, scope: FileScope, by: string) {
  const { name, parentId } = createFolderSchema.parse(input);
  let propertyId = input.propertyId ?? null;
  if (parentId) {
    const parent = await prisma.fileFolder.findUnique({ where: { id: parentId } });
    if (!parent) throw new FileError("That folder no longer exists", "NOT_FOUND");
    propertyId = parent.propertyId;
  }
  assertInScope(scope, propertyId);
  return prisma.fileFolder.create({ data: { name, parentId, propertyId, createdBy: by } });
}

export async function renameFolder(id: string, name: string, scope: FileScope) {
  const folder = await prisma.fileFolder.findUnique({ where: { id } });
  if (!folder) throw new FileError("That folder no longer exists", "NOT_FOUND");
  assertInScope(scope, folder.propertyId);
  return prisma.fileFolder.update({ where: { id }, data: { name: name.trim() } });
}

/** Only an empty folder goes: nobody loses files by tidying up. */
export async function deleteFolder(id: string, scope: FileScope): Promise<void> {
  const folder = await prisma.fileFolder.findUnique({
    where: { id },
    include: { _count: { select: { files: { where: { status: "ready", deletedAt: null } }, children: true } } },
  });
  if (!folder) throw new FileError("That folder no longer exists", "NOT_FOUND");
  assertInScope(scope, folder.propertyId);
  if (folder._count.files > 0 || folder._count.children > 0) {
    throw new FileError("Move or delete what's in this folder first", "CONFLICT");
  }
  await prisma.fileFolder.delete({ where: { id } });
}

export const updateFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional(),
  /** null moves it to the top level. */
  folderId: z.string().min(1).nullable().optional(),
});

export async function updateFile(input: z.infer<typeof updateFileSchema>, scope: FileScope) {
  const { id, name, description, folderId } = updateFileSchema.parse(input);
  const file = await loadFile(id, scope);
  if (folderId) {
    const folder = await prisma.fileFolder.findUnique({ where: { id: folderId } });
    if (!folder) throw new FileError("That folder no longer exists", "NOT_FOUND");
    assertInScope(scope, folder.propertyId);
    if (folder.propertyId !== file.propertyId) throw new FileError("That folder belongs to another property", "BAD_REQUEST");
  }
  return prisma.storedFile.update({ where: { id }, data: { name, description, folderId }, select: FILE_FIELDS });
}

/** The key, for a signed link, only to someone allowed to see the file. */
export async function getFileForDownload(id: string, scope: FileScope) {
  const file = await loadFile(id, scope);
  if (file.status !== "ready") throw new FileError("No such file", "NOT_FOUND");
  return file;
}

/** To the trash. Every share link stops working at once. */
export async function trashFile(id: string, scope: FileScope): Promise<void> {
  await loadFile(id, scope);
  await prisma.storedFile.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreFile(id: string, scope: FileScope): Promise<void> {
  await loadFile(id, scope);
  await prisma.storedFile.update({ where: { id }, data: { deletedAt: null } });
}

/** Files in scope that are in use, for the storage meter. */
export async function getStorageUsed(scope: FileScope) {
  const used = await prisma.storedFile.aggregate({
    where: { ...propertyScope(scope), status: "ready", deletedAt: null },
    _sum: { sizeBytes: true },
    _count: true,
  });
  return { bytes: used._sum.sizeBytes ?? 0, files: used._count };
}

/** What the sweeper should remove from R2: an old trash, and abandoned uploads. */
export function getFilesToPurge(now: Date = new Date()) {
  return prisma.storedFile.findMany({
    where: {
      OR: [
        { deletedAt: { lt: new Date(now.getTime() - TRASH_DAYS * 24 * HOUR) } },
        { status: "pending", createdAt: { lt: new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * HOUR) } },
      ],
    },
    select: { id: true, key: true },
    take: 200,
  });
}

/** Removes the record, once the object itself is gone. */
export async function forgetFile(id: string): Promise<void> {
  await prisma.storedFile.deleteMany({ where: { id } });
}

/* ---- Share links ---- */

export function hashSharePassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkSharePassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export const createShareSchema = z.object({
  fileId: z.string().min(1),
  /** Days the link lasts; unset means until revoked. */
  expiresInDays: z.number().int().positive().max(365).optional(),
  password: z.string().min(4).max(100).optional(),
  maxDownloads: z.number().int().positive().max(10_000).optional(),
});

function shareView(share: FileShare) {
  const { passwordHash, ...rest } = share;
  return { ...rest, hasPassword: passwordHash !== null };
}

export async function createShare(input: z.infer<typeof createShareSchema>, scope: FileScope, by: string) {
  const { fileId, expiresInDays, password, maxDownloads } = createShareSchema.parse(input);
  const file = await loadFile(fileId, scope);
  if (file.deletedAt) throw new FileError("That file is in the trash", "CONFLICT");
  const share = await prisma.fileShare.create({
    data: {
      fileId,
      token: randomBytes(24).toString("base64url"),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * HOUR) : null,
      passwordHash: password ? hashSharePassword(password) : null,
      maxDownloads,
      createdBy: by,
    },
  });
  return shareView(share);
}

export async function listShares(fileId: string, scope: FileScope) {
  await loadFile(fileId, scope);
  const shares = await prisma.fileShare.findMany({ where: { fileId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return shares.map(shareView);
}

export async function revokeShare(id: string, scope: FileScope): Promise<void> {
  const share = await prisma.fileShare.findUnique({ where: { id } });
  if (!share) throw new FileError("No such link", "NOT_FOUND");
  await loadFile(share.fileId, scope);
  await prisma.fileShare.update({ where: { id }, data: { revokedAt: new Date() } });
}

type ShareWithFile = FileShare & { file: StoredFile };

/** Why a link no longer works, in words for whoever opened it. */
function shareClosed(share: ShareWithFile, now: Date): string | undefined {
  if (share.revokedAt || share.file.deletedAt || share.file.status !== "ready") return "This link is no longer available.";
  if (share.expiresAt && share.expiresAt <= now) return "This link has expired.";
  if (share.maxDownloads !== null && share.downloads >= share.maxDownloads) return "This link has reached its download limit.";
  return undefined;
}

/** What the public page shows: the file's name and size, and nothing else. */
export async function getShareInfo(token: string) {
  const share = await prisma.fileShare.findUnique({ where: { token }, include: { file: true } });
  if (!share) return null;
  const closed = shareClosed(share, new Date());
  return {
    name: share.file.name,
    sizeBytes: share.file.sizeBytes,
    contentType: share.file.contentType,
    needsPassword: share.passwordHash !== null,
    closed: closed ?? null,
  };
}

/**
 * Spends one download of a link and returns the file to sign. The count moves
 * in one guarded write, so two people can't both take the last download.
 */
export async function claimShareDownload(token: string, password: string | undefined) {
  const share = await prisma.fileShare.findUnique({ where: { token }, include: { file: true } });
  if (!share) throw new FileError("This link is no longer available.", "NOT_FOUND");
  const closed = shareClosed(share, new Date());
  if (closed) throw new FileError(closed, "CONFLICT");
  if (share.passwordHash && !(password && checkSharePassword(password, share.passwordHash))) {
    throw new FileError("That password isn't right.", "FORBIDDEN");
  }
  const { count } = await prisma.fileShare.updateMany({
    where: {
      id: share.id,
      revokedAt: null,
      ...(share.maxDownloads !== null ? { downloads: { lt: share.maxDownloads } } : {}),
    },
    data: { downloads: { increment: 1 } },
  });
  if (count === 0) throw new FileError("This link has reached its download limit.", "CONFLICT");
  return share.file;
}
