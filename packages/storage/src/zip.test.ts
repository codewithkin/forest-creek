import { describe, expect, test } from "bun:test";

import { crc32, uniquePaths, ZipWriter, zipPath } from "./zip";

async function zipOf(entries: [string, string][]) {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter((chunk) => void chunks.push(chunk));
  for (const [path, text] of entries) await zip.add(path, new TextEncoder().encode(text), new Date(2026, 10, 2, 9, 30));
  await zip.finish();
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Reads an archive back through its central directory, the way unzip tools do. */
function readZip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    const localName = view.getUint16(local + 26, true);
    const data = bytes.subarray(local + 30 + localName, local + 30 + localName + size);
    expect(crc32(data)).toBe(view.getUint32(at + 16, true));
    files[name] = new TextDecoder().decode(data);
    at += 46 + nameLength;
  }
  return files;
}

describe("ZipWriter", () => {
  test("crc32 matches the standard value", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  test("an archive reads back with its folders and contents intact", async () => {
    const files = readZip(await zipOf([["Thyme/room 1.jpg", "one"], ["Thyme/Basil/menu é.pdf", "two"], ["notes.txt", ""]]));
    expect(files).toEqual({ "Thyme/room 1.jpg": "one", "Thyme/Basil/menu é.pdf": "two", "notes.txt": "" });
  });
});

describe("paths in the archive", () => {
  test("can never point outside the folder it extracts into", () => {
    expect(zipPath("../../etc/passwd")).toBe("etc/passwd");
    expect(zipPath("/Thyme\\Basil/a:b.jpg")).toBe("Thyme/Basil/a_b.jpg");
    expect(zipPath("")).toBe("file");
  });

  test("two files with one name in one folder both survive", () => {
    expect(uniquePaths(["A/photo.jpg", "A/photo.jpg", "a/PHOTO.jpg", "B/photo.jpg", "A/README"])).toEqual([
      "A/photo.jpg",
      "A/photo (2).jpg",
      "a/PHOTO (3).jpg",
      "B/photo.jpg",
      "A/README",
    ]);
  });
});
