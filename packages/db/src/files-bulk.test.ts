import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  createFolder,
  createReadyFile,
  ensureFolders,
  folderPathsToMake,
  getDownloadPlan,
  getTrashToDelete,
  listFiles,
  moveItems,
  prisma,
  restoreFiles,
  trashItems,
} from "./index";

/** Selections, drag and drop, folder uploads and zips, against the dev database. */
const SLUG = "files-bulk-test";
const OTHER_SLUG = "files-bulk-test-other";
const BY = "bulk-files@example.com";
let propertyId: string;
let otherPropertyId: string;

async function cleanup() {
  await prisma.storedFile.deleteMany({ where: { uploadedBy: BY } });
  // Leaves first: a folder can't go while it has children.
  for (let round = 0; round < 10; round++) {
    const { count } = await prisma.fileFolder.deleteMany({ where: { createdBy: BY, children: { none: {} } } });
    if (count === 0) break;
  }
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

const add = (name: string, extra: { folderId?: string; propertyId?: string } = {}) =>
  createReadyFile({ key: `files/test/${randomBytes(8).toString("hex")}`, name, contentType: "image/jpeg", sizeBytes: 500, propertyId, ...extra }, undefined, BY);

const folder = (name: string, parentId?: string, inProperty = propertyId) => createFolder({ name, parentId, propertyId: inProperty }, undefined, BY);

const message = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "no error";
};

describe("a folder upload", () => {
  test("needs each folder once, parents first", () => {
    expect(folderPathsToMake(["Thyme/Basil", "Thyme", "Caraway/../x", "Weirmouth/"])).toEqual(["Caraway", "Thyme", "Weirmouth", "Caraway/x", "Thyme/Basil"]);
  });

  test("lands as the same tree, and a second upload reuses it", async () => {
    const top = await folder("Rooms");
    const first = await ensureFolders({ paths: ["Thyme", "Thyme/Basil"], parentId: top.id }, undefined, BY);
    const again = await ensureFolders({ paths: ["Thyme/Basil", "Weirmouth"], parentId: top.id }, undefined, BY);
    expect(again["Thyme/Basil"]).toBe(first["Thyme/Basil"]!);
    const basil = await prisma.fileFolder.findUnique({ where: { id: first["Thyme/Basil"] }, include: { parent: true } });
    expect([basil?.name, basil?.parent?.name, basil?.parent?.parentId]).toEqual(["Basil", "Thyme", top.id]);
    expect(basil?.propertyId).toBe(propertyId);
  });

  test("a manager can't build one in another property", async () => {
    expect(await message(ensureFolders({ paths: ["X"], parentId: null, propertyId: otherPropertyId }, [propertyId], BY))).toContain("another property");
  });
});

describe("moving by drag and drop", () => {
  test("files and folders move together; a folder never into itself", async () => {
    const a = await folder("A");
    const b = await folder("B", a.id);
    const target = await folder("Target");
    const photo = await add("photo.jpg");
    await moveItems({ fileIds: [photo.id], folderIds: [a.id], to: target.id }, undefined);
    expect((await prisma.storedFile.findUnique({ where: { id: photo.id } }))?.folderId).toBe(target.id);
    expect((await prisma.fileFolder.findUnique({ where: { id: a.id } }))?.parentId).toBe(target.id);
    expect(await message(moveItems({ folderIds: [a.id], to: b.id }, undefined))).toContain("inside itself");
    await moveItems({ folderIds: [a.id], to: null }, undefined);
    expect((await prisma.fileFolder.findUnique({ where: { id: a.id } }))?.parentId).toBeNull();
  });

  test("nothing crosses into another property's folders", async () => {
    const theirs = await folder("Theirs", undefined, otherPropertyId);
    const photo = await add("mine.jpg");
    expect(await message(moveItems({ fileIds: [photo.id], to: theirs.id }, undefined))).toContain("own property");
    expect(await message(moveItems({ fileIds: [photo.id], to: null }, [otherPropertyId]))).toContain("another property");
  });
});

describe("trash, restore and delete forever", () => {
  test("a folder goes with everything in it; restored files come back to the top", async () => {
    const outer = await folder("Old");
    const inner = await folder("Older", outer.id);
    const one = await add("one.jpg", { folderId: outer.id });
    const two = await add("two.jpg", { folderId: inner.id });
    const loose = await add("loose.jpg");
    expect(await trashItems({ fileIds: [loose.id], folderIds: [outer.id] }, undefined)).toEqual({ trashed: 3 });
    expect(await prisma.fileFolder.count({ where: { id: { in: [outer.id, inner.id] } } })).toBe(0);
    const trash = await listFiles({ kind: "trash", propertyId }, undefined);
    expect(trash.map((file) => file.name).sort()).toEqual(expect.arrayContaining(["loose.jpg", "one.jpg", "two.jpg"]));

    expect(await restoreFiles([one.id, two.id], undefined)).toEqual({ restored: 2 });
    const back = await prisma.storedFile.findMany({ where: { id: { in: [one.id, two.id] } } });
    expect(back.map((file) => [file.deletedAt, file.folderId])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  test("delete forever only ever picks trashed files, and stays in scope", async () => {
    const kept = await add("kept.jpg");
    const gone = await add("gone.jpg");
    const theirs = await add("theirs.jpg", { propertyId: otherPropertyId });
    await trashItems({ fileIds: [gone.id, theirs.id] }, undefined);
    const picked = await getTrashToDelete([kept.id, gone.id, theirs.id], [propertyId]);
    expect(picked.map((file) => file.id)).toEqual([gone.id]);
    expect((await getTrashToDelete(undefined, [propertyId])).map((file) => file.id)).toContain(gone.id);
  });
});

describe("downloading a selection", () => {
  test("a folder brings its whole tree, with paths for the zip", async () => {
    const thyme = await folder("Thyme");
    const basil = await folder("Basil", thyme.id);
    await add("bed.jpg", { folderId: thyme.id });
    await add("view.jpg", { folderId: basil.id });
    const single = await add("menu.jpg");
    const plan = await getDownloadPlan({ folderIds: [thyme.id], fileIds: [single.id] }, undefined);
    expect(plan.map((file) => file.path).sort()).toEqual(["Thyme/Basil/view.jpg", "Thyme/bed.jpg", "menu.jpg"]);
    // A manager of another property gets nothing from it.
    expect(await message(getDownloadPlan({ folderIds: [thyme.id] }, [otherPropertyId]))).toContain("no longer exists");
  });
});
