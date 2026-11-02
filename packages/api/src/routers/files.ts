import {
  claimShareDownload,
  createFolder,
  createFolderSchema,
  createPendingFile,
  createReadyFile,
  createShare,
  createShareSchema,
  deleteFolder,
  ensureFolders,
  ensureFoldersSchema,
  FileError,
  forgetFile,
  getDownloadPlan,
  getTrashToDelete,
  itemsSchema,
  moveItems,
  moveItemsSchema,
  restoreFiles,
  trashItems,
  folderPath,
  getFileForDownload,
  getPendingFile,
  getShareInfo,
  getStorageUsed,
  listAllFolders,
  listFiles,
  listFilesSchema,
  listFolders,
  listShares,
  markFileReady,
  renameFolder,
  restoreFile,
  revokeShare,
  startFileSchema,
  trashFile,
  updateFile,
  updateFileSchema,
  type FileScope,
} from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";
import {
  canPreview,
  createFileDownloadUrl,
  createFileUploadUrl,
  deleteStoredFile,
  importRemoteFile,
  isAllowedFileType,
  isStorageConfigured,
  MAX_FILE_BYTES,
  newFileKey,
  putStoredFile,
  RemoteFileError,
  storedFileSize,
  typeFromName,
} from "@forest-creek/storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, rateLimitedProcedure, router, staffProcedure, type StaffScope } from "../index";

const scopeOf = (staff: StaffScope): FileScope => (staff.propertyIds === "all" ? undefined : staff.propertyIds);

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FileError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    if (error instanceof TRPCError) throw error;
    // R2 may be down; the caller gets something a person can act on.
    console.error(`[files] storage request failed: ${describeError(error)}`);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The file store didn't answer. Try again shortly." });
  }
}

function requireStorage(): void {
  if (!isStorageConfigured()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "File storage isn't set up. Add the R2 settings to the server." });
  }
}

/** Refuses what can't be stored; a browser that names no type is judged by the file's name. */
function checkFile(name: string, contentType: string, sizeBytes: number): string {
  const type = isAllowedFileType(contentType) ? contentType : typeFromName(name);
  if (!type) throw new TRPCError({ code: "BAD_REQUEST", message: `${name} is a type of file that can't be stored.` });
  if (sizeBytes > MAX_FILE_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: `${name} is larger than the 50 MB limit.` });
  return type;
}

const MINUTE = 60_000;
// Guessing a share's password stops being worthwhile well before it succeeds.
const tokenOf = (input: unknown) => (typeof input === "object" && input !== null && "token" in input ? String((input as { token: unknown }).token) : undefined);
const shareLimited = rateLimitedProcedure("share-download", { limit: 10, windowMs: 10 * MINUTE }, tokenOf);

export const filesRouter = router({
  /** Lets the screen say "not set up" instead of offering a broken upload. */
  status: staffProcedure.query(async ({ ctx }) => ({
    configured: isStorageConfigured(),
    /** Only the owner keeps files for the whole group. */
    canUseGroup: ctx.staff.propertyIds === "all",
    used: await getStorageUsed(scopeOf(ctx.staff)),
    maxFileBytes: MAX_FILE_BYTES,
  })),

  list: staffProcedure.input(listFilesSchema).query(({ ctx, input }) => guarded(() => listFiles(input, scopeOf(ctx.staff)))),

  folders: staffProcedure
    .input(z.object({ parentId: z.string().min(1).nullable(), propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => guarded(() => listFolders(input.parentId, scopeOf(ctx.staff), input.propertyId))),

  allFolders: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => guarded(() => listAllFolders(scopeOf(ctx.staff), input.propertyId))),

  folderPath: staffProcedure.input(z.string().min(1)).query(({ ctx, input }) => guarded(() => folderPath(input, scopeOf(ctx.staff)))),

  createFolder: staffProcedure
    .input(createFolderSchema)
    .mutation(({ ctx, input }) => guarded(() => createFolder(input, scopeOf(ctx.staff), ctx.session.user.email))),

  renameFolder: staffProcedure
    .input(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) }))
    .mutation(({ ctx, input }) => guarded(() => renameFolder(input.id, input.name, scopeOf(ctx.staff)))),

  deleteFolder: staffProcedure.input(z.string().min(1)).mutation(({ ctx, input }) => guarded(() => deleteFolder(input, scopeOf(ctx.staff)))),

  /** Step one of an upload: a signed PUT, straight from the browser to R2. */
  startUpload: staffProcedure.input(startFileSchema).mutation(({ ctx, input }) =>
    guarded(async () => {
      requireStorage();
      const contentType = checkFile(input.name, input.contentType, input.sizeBytes);
      const key = newFileKey(input.name);
      const file = await createPendingFile({ ...input, contentType, key }, scopeOf(ctx.staff), ctx.session.user.email);
      return { fileId: file.id, contentType, uploadUrl: await createFileUploadUrl(key, contentType, input.sizeBytes) };
    }),
  ),

  /** Step two: what R2 actually holds is checked before the file appears. */
  finishUpload: staffProcedure.input(z.string().min(1)).mutation(({ ctx, input }) =>
    guarded(async () => {
      requireStorage();
      const file = await getPendingFile(input, scopeOf(ctx.staff));
      const size = await storedFileSize(file.key);
      if (size === undefined) throw new FileError("The upload didn't reach the file store. Try again.", "CONFLICT");
      if (size !== file.sizeBytes) throw new FileError("The upload arrived incomplete. Try again.", "CONFLICT");
      await markFileReady(file.id);
      return { id: file.id };
    }),
  ),

  /** From a link, on the server: see fetchRemoteFile for what it refuses. */
  importUrl: staffProcedure
    .input(startFileSchema.pick({ description: true, folderId: true, propertyId: true, bookingId: true, quoteId: true }).extend({ url: z.url().max(2000) }))
    .mutation(({ ctx, input }) =>
      guarded(async () => {
        requireStorage();
        const { url, ...place } = input;
        let remote;
        try {
          remote = await importRemoteFile(url);
        } catch (error) {
          if (error instanceof RemoteFileError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          throw error;
        }
        const key = newFileKey(remote.name);
        await putStoredFile(key, remote.bytes, remote.contentType);
        const file = await createReadyFile(
          { ...place, key, name: remote.name, contentType: remote.contentType, sizeBytes: remote.bytes.byteLength },
          scopeOf(ctx.staff),
          ctx.session.user.email,
        );
        return { id: file.id };
      }),
    ),

  update: staffProcedure.input(updateFileSchema).mutation(({ ctx, input }) => guarded(() => updateFile(input, scopeOf(ctx.staff)))),

  /** A link that dies in minutes. The stored key never reaches a browser any other way. */
  link: staffProcedure.input(z.object({ id: z.string().min(1), preview: z.boolean().default(false) })).mutation(({ ctx, input }) =>
    guarded(async () => {
      requireStorage();
      const file = await getFileForDownload(input.id, scopeOf(ctx.staff));
      return { url: await createFileDownloadUrl(file.key, file.name, { inline: input.preview && canPreview(file.contentType) }) };
    }),
  ),

  trash: staffProcedure.input(z.string().min(1)).mutation(({ ctx, input }) => guarded(() => trashFile(input, scopeOf(ctx.staff)))),
  restore: staffProcedure.input(z.string().min(1)).mutation(({ ctx, input }) => guarded(() => restoreFile(input, scopeOf(ctx.staff)))),

  /** Drag and drop, and "Move to" on a selection. */
  move: staffProcedure.input(moveItemsSchema).mutation(({ ctx, input }) => guarded(() => moveItems(input, scopeOf(ctx.staff)))),

  trashMany: staffProcedure.input(itemsSchema).mutation(({ ctx, input }) => guarded(() => trashItems(input, scopeOf(ctx.staff)))),

  restoreMany: staffProcedure
    .input(z.array(z.string().min(1)).min(1).max(1000))
    .mutation(({ ctx, input }) => guarded(() => restoreFiles(input, scopeOf(ctx.staff)))),

  /**
   * Gone for good: the chosen trashed files, or the whole trash when no ids
   * come. The object leaves R2 first and the record after, so a failure
   * leaves the file in the trash to try again, never a record with no file.
   */
  deleteForever: staffProcedure.input(z.object({ ids: z.array(z.string().min(1)).max(2000).optional() })).mutation(({ ctx, input }) =>
    guarded(async () => {
      requireStorage();
      let deleted = 0;
      let failed = 0;
      for (const file of await getTrashToDelete(input.ids, scopeOf(ctx.staff))) {
        try {
          await deleteStoredFile(file.key);
          await forgetFile(file.id);
          deleted++;
        } catch (error) {
          failed++;
          console.error(`[files] could not delete file ${file.id}: ${describeError(error)}`);
        }
      }
      return { deleted, failed };
    }),
  ),

  /** A dropped folder's tree, made (or found) before its files upload into it. */
  ensureFolders: staffProcedure
    .input(ensureFoldersSchema)
    .mutation(({ ctx, input }) => guarded(() => ensureFolders(input, scopeOf(ctx.staff), ctx.session.user.email))),

  /** What a zip of a selection holds, with a short link per file. Used by the web's download route. */
  downloadPlan: staffProcedure.input(itemsSchema).query(({ ctx, input }) =>
    guarded(async () => {
      requireStorage();
      const files = await getDownloadPlan(input, scopeOf(ctx.staff));
      return Promise.all(
        files.map(async (file) => ({
          path: file.path,
          sizeBytes: file.sizeBytes,
          createdAt: file.createdAt,
          // Long enough for a large zip to reach the last file.
          url: await createFileDownloadUrl(file.key, file.name, { expiresIn: 30 * 60 }),
        })),
      );
    }),
  ),

  shares: staffProcedure.input(z.string().min(1)).query(({ ctx, input }) => guarded(() => listShares(input, scopeOf(ctx.staff)))),

  createShare: staffProcedure
    .input(createShareSchema)
    .mutation(({ ctx, input }) => guarded(() => createShare(input, scopeOf(ctx.staff), ctx.session.user.email))),

  revokeShare: staffProcedure.input(z.string().min(1)).mutation(({ ctx, input }) => guarded(() => revokeShare(input, scopeOf(ctx.staff)))),

  // The public side of a share link.
  shareInfo: publicProcedure.input(z.string().trim().min(1).max(64)).query(async ({ input }) => {
    const info = await getShareInfo(input);
    if (!info) throw new TRPCError({ code: "NOT_FOUND", message: "This link is no longer available." });
    return info;
  }),

  shareDownload: shareLimited
    .input(z.object({ token: z.string().trim().min(1).max(64), password: z.string().max(100).optional() }))
    .mutation(({ input }) =>
      guarded(async () => {
        requireStorage();
        const file = await claimShareDownload(input.token, input.password);
        return { url: await createFileDownloadUrl(file.key, file.name, { expiresIn: 60 }) };
      }),
    ),
});
