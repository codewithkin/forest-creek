import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { DatabaseSessionStore, type SessionDb } from "./session-store";

/** An in-memory stand-in for the whatsapp_session table. */
function memoryDb(): SessionDb & { rows: Map<string, Uint8Array> } {
  const rows = new Map<string, Uint8Array>();
  return {
    rows,
    save: async (session, data) => rows.set(session, new Uint8Array(data)),
    load: async (session) => rows.get(session) ?? null,
    info: async (session) => {
      const data = rows.get(session);
      return data ? { session, sizeBytes: data.byteLength, updatedAt: new Date() } : null;
    },
    remove: async (session) => rows.delete(session),
  };
}

const failing: SessionDb = {
  save: async () => { throw new Error("relation \"whatsapp_session\" does not exist"); },
  load: async () => { throw new Error("down"); },
  info: async () => { throw new Error("relation \"whatsapp_session\" does not exist"); },
  remove: async () => { throw new Error("down"); },
};

let dir: string;
beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), "wa-store-")); });
afterAll(() => rm(dir, { recursive: true, force: true }));

const SESSION = "RemoteAuth-forest-creek";

describe("DatabaseSessionStore", () => {
  test("saves the archive RemoteAuth wrote, and restores it byte for byte", async () => {
    const db = memoryDb();
    const store = new DatabaseSessionStore(dir, db);
    const archive = Buffer.from("PK\u0003\u0004 a zipped Chromium profile");
    await writeFile(store.archivePath(SESSION), archive);

    expect(await store.sessionExists({ session: SESSION })).toBe(false);
    await store.save({ session: SESSION });
    expect(await store.sessionExists({ session: SESSION })).toBe(true);

    const target = path.join(dir, "restore", `${SESSION}.zip`);
    await store.extract({ session: SESSION, path: target });
    expect(await readFile(target)).toEqual(archive);
    expect((await store.info(SESSION))?.sizeBytes).toBe(archive.length);
  });

  test("logging out deletes it, so the next boot asks for a QR", async () => {
    const db = memoryDb();
    const store = new DatabaseSessionStore(dir, db);
    db.rows.set(SESSION, new Uint8Array([1, 2, 3]));
    await store.delete({ session: SESSION });
    expect(await store.sessionExists({ session: SESSION })).toBe(false);
    await store.delete({ session: SESSION }); // nothing left: still fine
  });

  test("a failed backup never throws — RemoteAuth calls it from a bare timer", async () => {
    const store = new DatabaseSessionStore(dir, failing);
    await writeFile(store.archivePath(SESSION), "zip");
    await store.save({ session: SESSION });
    await store.save({ session: "no-archive-on-disk" });
    await store.delete({ session: SESSION });
  });

  test("before the server has migrated, there is simply no stored session", async () => {
    const store = new DatabaseSessionStore(dir, failing);
    expect(await store.sessionExists({ session: SESSION })).toBe(false);
    expect(await store.info(SESSION)).toBeNull();
  });

  test("restoring a session that is not there fails loudly instead of writing an empty profile", async () => {
    const store = new DatabaseSessionStore(dir, memoryDb());
    expect(await store.extract({ session: "missing", path: path.join(dir, "x.zip") }).then(() => "ok", (e: Error) => e.message)).toContain(
      "No stored WhatsApp session",
    );
  });
});
