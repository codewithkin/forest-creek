import { afterAll, describe, expect, test } from "bun:test";

import {
  deleteWhatsappSession,
  getWhatsappSessionInfo,
  loadWhatsappSession,
  saveWhatsappSession,
} from "./index";

const SESSION = "whatsapp-session-test";
afterAll(() => deleteWhatsappSession(SESSION));

describe("the WhatsApp agent's stored pairing", () => {
  test("an archive round-trips byte for byte, and a resave replaces it", async () => {
    // A Node Buffer, as RemoteAuth's archive is read from disk.
    const first = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 255]);
    const saved = await saveWhatsappSession(SESSION, first);
    expect(saved.sizeBytes).toBe(8);
    expect(Buffer.from((await loadWhatsappSession(SESSION))!)).toEqual(first);

    const larger = Buffer.alloc(3 * 1024 * 1024, 7);
    await saveWhatsappSession(SESSION, larger);
    expect((await getWhatsappSessionInfo(SESSION))?.sizeBytes).toBe(larger.length);
    expect((await loadWhatsappSession(SESSION))!.byteLength).toBe(larger.length);
  });

  test("logging out forgets it, and forgetting twice is harmless", async () => {
    await saveWhatsappSession(SESSION, Buffer.from("zip"));
    expect(await deleteWhatsappSession(SESSION)).toBe(true);
    expect(await loadWhatsappSession(SESSION)).toBeNull();
    expect(await getWhatsappSessionInfo(SESSION)).toBeNull();
    expect(await deleteWhatsappSession(SESSION)).toBe(false);
  });
});
