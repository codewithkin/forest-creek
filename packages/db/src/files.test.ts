import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  checkSharePassword,
  claimShareDownload,
  createFolder,
  createPendingFile,
  createReadyFile,
  createShare,
  deleteFolder,
  folderPath,
  forgetFile,
  getFilesToPurge,
  getPendingFile,
  getShareInfo,
  getStorageUsed,
  hashSharePassword,
  listFiles,
  listFolders,
  listShares,
  markFileReady,
  prisma,
  restoreFile,
  revokeShare,
  TRASH_DAYS,
  trashFile,
  updateFile,
} from "./index";

/** The file store's records, against the dev database on throwaway properties. */
const SLUG = "files-test";
const OTHER_SLUG = "files-test-other";
const BY = "manager@example.com";
let propertyId: string;
let otherPropertyId: string;

async function cleanup() {
  await prisma.storedFile.deleteMany({ where: { uploadedBy: BY } });
  await prisma.fileFolder.deleteMany({ where: { createdBy: BY, parentId: { not: null } } });
  await prisma.fileFolder.deleteMany({ where: { createdBy: BY } });
  await prisma.property.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
}

const property = (slug: string) =>
  prisma.property.create({
    data: { slug, name: slug, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
  });

beforeAll(async () => {
  await cleanup();
  propertyId = (await property(SLUG)).id;
  otherPropertyId = (await property(OTHER_SLUG)).id;
});
afterAll(cleanup);

const add = (name: string, extra: Partial<Parameters<typeof createReadyFile>[0]> = {}, scope: string[] | undefined = undefined) =>
  createReadyFile(
    { key: `files/test/${randomBytes(8).toString("hex")}`, name, contentType: "application/pdf", sizeBytes: 1000, propertyId, ...extra },
    scope,
    BY,
  );

const message = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "(did not reject)";
};

describe("uploading", () => {
  test("a file stays hidden until its upload is confirmed", async () => {
    const pending = await createPendingFile(
      { key: `files/test/${randomBytes(8).toString("hex")}`, name: "Lease.pdf", contentType: "application/pdf", sizeBytes: 5, propertyId },
      undefined,
      BY,
    );
    expect((await listFiles({ search: "Lease.pdf" }, undefined)).map((file) => file.id)).not.toContain(pending.id);
    expect((await getPendingFile(pending.id, undefined)).id).toBe(pending.id);
    await markFileReady(pending.id);
    expect((await listFiles({ search: "Lease.pdf" }, undefined)).map((file) => file.id)).toContain(pending.id);
    expect(await message(getPendingFile(pending.id, undefined))).toContain("already finished");
  });

  test("the key, the file's secret, never leaves in a list", async () => {
    const file = await add("Secret.pdf");
    const [listed] = await listFiles({ search: "Secret.pdf" }, undefined);
    expect(JSON.stringify(listed)).not.toContain(file.key);
  });
});

describe("who sees what", () => {
  test("a manager sees their property's files, not another's and not group-wide ones", async () => {
    const mine = await add("Mine.pdf");
    const theirs = await add("Theirs.pdf", { propertyId: otherPropertyId });
    const group = await add("Group.pdf", { propertyId: undefined });
    const seen = (await listFiles({}, [propertyId])).map((file) => file.id);
    expect(seen).toContain(mine.id);
    expect(seen).not.toContain(theirs.id);
    expect(seen).not.toContain(group.id);
    expect((await listFiles({}, undefined)).map((file) => file.id)).toEqual(expect.arrayContaining([mine.id, theirs.id, group.id]));
  });

  test("a manager can't reach into another property, or upload group-wide", async () => {
    const theirs = await add("Off-limits.pdf", { propertyId: otherPropertyId });
    expect(await message(trashFile(theirs.id, [propertyId]))).toContain("another property");
    expect(await message(updateFile({ id: theirs.id, name: "Mine now.pdf" }, [propertyId]))).toContain("another property");
    expect(await message(createShare({ fileId: theirs.id }, [propertyId], BY))).toContain("another property");
    expect(await message(add("Sneaky.pdf", { propertyId: undefined }, [propertyId]))).toContain("another property");
    expect(await message(createFolder({ name: "Sneaky" }, [propertyId], BY))).toContain("another property");
  });
});

describe("folders", () => {
  test("nest, show their trail, and take their property from the parent", async () => {
    const top = await createFolder({ name: "Contracts", propertyId }, undefined, BY);
    const inner = await createFolder({ name: "2026", parentId: top.id }, undefined, BY);
    expect(inner.propertyId).toBe(propertyId);
    expect((await folderPath(inner.id, undefined)).map((folder) => folder.name)).toEqual(["Contracts", "2026"]);
    expect((await listFolders(top.id, undefined)).map((folder) => folder.name)).toEqual(["2026"]);
  });

  test("only an empty folder can be deleted", async () => {
    const folder = await createFolder({ name: "Keep", propertyId }, undefined, BY);
    const file = await add("Inside.pdf", { folderId: folder.id });
    expect(await message(deleteFolder(folder.id, undefined))).toContain("first");
    await updateFile({ id: file.id, folderId: null }, undefined);
    await deleteFolder(folder.id, undefined);
    expect((await listFiles({ search: "Inside.pdf" }, undefined))[0]?.folderId).toBeNull();
  });

  test("a file can't be moved into another property's folder", async () => {
    const elsewhere = await createFolder({ name: "Elsewhere", propertyId: otherPropertyId }, undefined, BY);
    const file = await add("Stay.pdf");
    expect(await message(updateFile({ id: file.id, folderId: elsewhere.id }, undefined))).toContain("another property");
  });
});

describe("the trash", () => {
  test("hides a file, can bring it back, and only purges after the wait", async () => {
    const file = await add("Binned.pdf");
    await trashFile(file.id, undefined);
    expect((await listFiles({ search: "Binned.pdf" }, undefined)).length).toBe(0);
    expect((await listFiles({ kind: "trash" }, undefined)).map((row) => row.id)).toContain(file.id);
    expect((await getFilesToPurge()).map((row) => row.id)).not.toContain(file.id);

    await restoreFile(file.id, undefined);
    expect((await listFiles({ search: "Binned.pdf" }, undefined)).length).toBe(1);

    await trashFile(file.id, undefined);
    const later = new Date(Date.now() + (TRASH_DAYS + 1) * 86_400_000);
    expect((await getFilesToPurge(later)).map((row) => row.id)).toContain(file.id);
    await forgetFile(file.id);
    expect(await prisma.storedFile.count({ where: { id: file.id } })).toBe(0);
  });

  test("abandoned uploads are cleared after a day, not before", async () => {
    const pending = await createPendingFile(
      { key: `files/test/${randomBytes(8).toString("hex")}`, name: "Abandoned.pdf", contentType: "application/pdf", sizeBytes: 5, propertyId },
      undefined,
      BY,
    );
    expect((await getFilesToPurge()).map((row) => row.id)).not.toContain(pending.id);
    expect((await getFilesToPurge(new Date(Date.now() + 25 * 3_600_000))).map((row) => row.id)).toContain(pending.id);
  });

  test("the storage meter counts what's in use, not the trash", async () => {
    const before = await getStorageUsed([propertyId]);
    const file = await add("Metered.pdf", { sizeBytes: 5000 });
    expect((await getStorageUsed([propertyId])).bytes).toBe(before.bytes + 5000);
    await trashFile(file.id, undefined);
    expect((await getStorageUsed([propertyId])).bytes).toBe(before.bytes);
  });
});

describe("share links", () => {
  test("passwords are hashed and checked", () => {
    const stored = hashSharePassword("vumba2026");
    expect(stored).not.toContain("vumba2026");
    expect(checkSharePassword("vumba2026", stored)).toBe(true);
    expect(checkSharePassword("wrong", stored)).toBe(false);
  });

  test("a link gives the file, without showing its key or password", async () => {
    const file = await add("Shared.pdf");
    const share = await createShare({ fileId: file.id, password: "open sesame" }, undefined, BY);
    expect(JSON.stringify(share)).not.toContain("passwordHash");
    expect(share.hasPassword).toBe(true);
    const info = await getShareInfo(share.token);
    expect(info).toMatchObject({ name: "Shared.pdf", needsPassword: true, closed: null });
    expect(JSON.stringify(info)).not.toContain(file.key);

    expect(await message(claimShareDownload(share.token, undefined))).toContain("password");
    expect(await message(claimShareDownload(share.token, "wrong"))).toContain("password");
    expect((await claimShareDownload(share.token, "open sesame")).id).toBe(file.id);
  });

  test("a download limit holds even when requests race for the last one", async () => {
    const file = await add("Limited.pdf");
    const share = await createShare({ fileId: file.id, maxDownloads: 2 }, undefined, BY);
    const race = await Promise.allSettled([1, 2, 3, 4, 5].map(() => claimShareDownload(share.token, undefined)));
    expect(race.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(2);
    expect((await getShareInfo(share.token))?.closed).toContain("limit");
  });

  test("an expired or revoked link, or a binned file, stops working", async () => {
    const file = await add("Closing.pdf");
    const expired = await createShare({ fileId: file.id, expiresInDays: 1 }, undefined, BY);
    await prisma.fileShare.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await message(claimShareDownload(expired.token, undefined))).toContain("expired");

    const revoked = await createShare({ fileId: file.id }, undefined, BY);
    await revokeShare(revoked.id, undefined);
    expect(await message(claimShareDownload(revoked.token, undefined))).toContain("no longer available");
    expect((await listShares(file.id, undefined)).map((share) => share.id)).not.toContain(revoked.id);

    const binned = await createShare({ fileId: file.id }, undefined, BY);
    await trashFile(file.id, undefined);
    expect(await message(claimShareDownload(binned.token, undefined))).toContain("no longer available");
    expect(await getShareInfo("no-such-token")).toBeNull();
  });
});
