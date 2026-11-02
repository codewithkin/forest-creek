/**
 * A plain ZIP archive, written as it goes, for downloading a folder or a
 * selection in one file. Import-free and tested.
 *
 * Entries are STORED, not compressed: photos, PDFs and Office files are
 * already compressed, so deflating them again costs time and saves nothing.
 * Each entry's bytes are in hand before its header is written (files are at
 * most 50 MB), so no data descriptors are needed. Names are UTF-8 (flag 11).
 * No ZIP64: callers keep an archive under 4 GB and 65,535 entries.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The archive limits a caller must stay inside. */
export const ZIP_MAX_BYTES = 3.5 * 1024 ** 3;
export const ZIP_MAX_ENTRIES = 60_000;

function dosTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * A safe path inside the archive: forward slashes, no leading slash, no "..",
 * nothing a zip tool could write outside the folder it extracts into.
 */
export function zipPath(path: string): string {
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "file";
}

/** Makes every path unique: a second "photo.jpg" in a folder becomes "photo (2).jpg". */
export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.map((original) => {
    const path = zipPath(original);
    if (!seen.has(path.toLowerCase())) {
      seen.add(path.toLowerCase());
      return path;
    }
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    const [stem, ext] = dot > slash + 1 ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
      if (!seen.has(candidate.toLowerCase())) {
        seen.add(candidate.toLowerCase());
        return candidate;
      }
    }
  });
}

type Written = { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number };

/**
 * Writes entries one at a time through `write`, then the central directory on
 * `finish`. Paths go in as given: pass them through uniquePaths first.
 */
export class ZipWriter {
  private offset = 0;
  private readonly entries: Written[] = [];
  private readonly encoder = new TextEncoder();

  constructor(private readonly write: (chunk: Uint8Array) => void | Promise<void>) {}

  async add(path: string, bytes: Uint8Array, modified: Date = new Date()): Promise<void> {
    const name = this.encoder.encode(path);
    const crc = crc32(bytes);
    const { time, date } = dosTime(modified);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 names
    view.setUint16(8, 0, true); // stored
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    header.set(name, 30);
    this.entries.push({ name, crc, size: bytes.length, offset: this.offset, time, date });
    await this.write(header);
    await this.write(bytes);
    this.offset += header.length + bytes.length;
  }

  async finish(): Promise<void> {
    const start = this.offset;
    let size = 0;
    for (const entry of this.entries) {
      const record = new Uint8Array(46 + entry.name.length);
      const view = new DataView(record.buffer);
      view.setUint32(0, 0x02014b50, true); // central directory header
      view.setUint16(4, 20, true); // made by
      view.setUint16(6, 20, true); // version needed
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.time, true);
      view.setUint16(14, entry.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.name.length, true);
      view.setUint32(42, entry.offset, true);
      record.set(entry.name, 46);
      await this.write(record);
      size += record.length;
    }
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); // end of central directory
    view.setUint16(8, this.entries.length, true);
    view.setUint16(10, this.entries.length, true);
    view.setUint32(12, size, true);
    view.setUint32(16, start, true);
    await this.write(end);
  }
}
