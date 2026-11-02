// Import-free so it can be unit tested without env, R2 or a network.

/** What the file store accepts. Nothing a browser would run as a page (no HTML, no SVG). */
export const fileTypes = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/csv": "csv",
  "text/plain": "txt",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/zip": "zip",
} as const;

export type FileType = keyof typeof fileTypes;

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function isAllowedFileType(type: string): type is FileType {
  return Object.hasOwn(fileTypes, type);
}

/** The allowed type a file name implies, for browsers and servers that give none. */
export function typeFromName(name: string): FileType | undefined {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "jpeg") return "image/jpeg";
  return (Object.keys(fileTypes) as FileType[]).find((type) => fileTypes[type] === extension);
}

/** Types a browser can safely show in the page; anything else only downloads. */
export function canPreview(type: string): boolean {
  return type === "application/pdf" || type.startsWith("image/") || type === "video/mp4";
}

/** A name safe in an object key: ASCII, no path, never empty. */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .slice(0, 100);
  return cleaned || "file";
}

/** "Attachment" header for a download, keeping accented names intact in modern browsers. */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = safeFileName(name);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function ipv4ToNumber(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  const bytes = parts.map(Number);
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return undefined;
  return bytes.reduce((value, byte) => value * 256 + byte, 0);
}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/**
 * Addresses a server-side fetch must never reach: loopback, private networks,
 * link-local (which includes cloud metadata services), anything not plainly
 * public. Unparseable means no.
 */
export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1]! : lower;

  const number = ipv4ToNumber(v4);
  if (number !== undefined) {
    return PRIVATE_V4.some(([network, bits]) => {
      const size = 2 ** (32 - bits);
      const base = ipv4ToNumber(network)!;
      return number >= base && number < base + size;
    });
  }
  if (!lower.includes(":")) return true;
  if (lower === "::" || lower === "::1") return true;
  // Mapped addresses written in hex, ::ffff:7f00:1, are refused rather than decoded.
  if (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b:")) return true;
  const first = Number.parseInt(lower.split(":")[0] || "0", 16);
  if (first >= 0xfc00 && first <= 0xfdff) return true; // unique local
  if (first >= 0xfe80 && first <= 0xfebf) return true; // link local
  if (first >= 0xff00) return true; // multicast
  return false;
}

export type RemoteFile = { bytes: Uint8Array; contentType: FileType; name: string };

export class RemoteFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteFileError";
  }
}

type Lookup = (hostname: string) => Promise<string[]>;

const MAX_REDIRECTS = 3;

async function assertPublicUrl(raw: string, lookup: Lookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteFileError("That isn't a valid link.");
  }
  if (url.protocol !== "https:") throw new RemoteFileError("Only https links can be imported.");
  if (url.username || url.password) throw new RemoteFileError("Links with a login in them can't be imported.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".internal")) {
    throw new RemoteFileError("That address can't be imported.");
  }
  let addresses: string[];
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new RemoteFileError("That address couldn't be found.");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new RemoteFileError("That address can't be imported.");
  return url;
}

/**
 * Downloads a staff-supplied link on the server. The link is untrusted: it must
 * be https and resolve to public addresses, every redirect is checked the same
 * way (fetch would otherwise follow one straight into the private network), and
 * the body is cut off at the size limit however large it claims to be.
 */
export async function fetchRemoteFile(
  raw: string,
  options: { fetch: typeof fetch; lookup: Lookup; maxBytes?: number; timeoutMs?: number },
): Promise<RemoteFile> {
  const maxBytes = options.maxBytes ?? MAX_FILE_BYTES;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);

  let current = raw;
  let response: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current, options.lookup);
    try {
      response = await options.fetch(url, { redirect: "manual", signal, headers: { "User-Agent": "ForestCreekFiles/1.0" } });
    } catch {
      throw new RemoteFileError("That link couldn't be reached.");
    }
    if (response.status < 300 || response.status >= 400) break;
    const next = response.headers.get("location");
    if (!next) throw new RemoteFileError("That link redirects nowhere.");
    current = new URL(next, url).toString();
    response = undefined;
  }
  if (!response) throw new RemoteFileError("That link redirects too many times.");
  if (!response.ok) throw new RemoteFileError(`That link answered ${response.status}.`);

  const name = safeFileName(decodeURIComponent(new URL(current).pathname.split("/").pop() ?? "") || "imported-file");
  const header = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentType = isAllowedFileType(header) ? header : typeFromName(name);
  if (!contentType) throw new RemoteFileError("That type of file can't be stored.");

  const claimed = Number(response.headers.get("content-length") ?? 0);
  if (claimed > maxBytes) throw new RemoteFileError("That file is larger than the 50 MB limit.");

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new RemoteFileError("That link returned nothing.");
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RemoteFileError("That file is larger than the 50 MB limit.");
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RemoteFileError) throw error;
    throw new RemoteFileError("That link stopped part-way through.");
  } finally {
    reader.cancel().catch(() => undefined);
  }
  if (size === 0) throw new RemoteFileError("That link returned nothing.");

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, contentType, name };
}
