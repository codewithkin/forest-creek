import sharp from "sharp";

/**
 * Turning a stored photo (an R2 URL, or a /media path the API serves) into
 * something WhatsApp sends reliably and quickly: a JPEG no bigger than a phone
 * screen needs. Free of whatsapp-web.js, like reply.ts, so it is tested
 * without a browser.
 *
 * Why not MessageMedia.fromUrl: it downloads with no timeout, and under Bun
 * (no Response.buffer) it base64-encodes byte by byte. Uploads go to WhatsApp
 * as they are — a 2.6 MB PNG cover took 20s just to download from r2.dev, and
 * the seeded photos are WebP, which WhatsApp does not take as a photo. One
 * failed send meant the guest got "the photos wouldn't load".
 */

export type PreparedPhoto = { mimetype: "image/jpeg"; data: string; filename: string; bytes: number };

/** WhatsApp shows photos at most about this wide; anything larger is wasted upload. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;
/** r2.dev is rate limited and can be slow; past this, give up on that photo. */
export const DOWNLOAD_TIMEOUT_MS = 25_000;
/** Refuse anything absurd before decoding it. */
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
/** Prepared photos kept in memory, so the same property's photos go out instantly the next time. */
const CACHE_LIMIT = 80;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const cache = new Map<string, Promise<PreparedPhoto>>();

/** For tests. */
export function clearPhotoCache(): void {
  cache.clear();
}

async function download(url: string, fetchImpl: Fetch): Promise<Buffer> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { accept: "image/*" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const type = response.headers.get("content-type") ?? "";
  if (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream")) {
    throw new Error(`not an image (${type}) at ${url}`);
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) throw new Error(`image too large (${length} bytes) at ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Any image sharp can read, as an upright JPEG that fits in MAX_EDGE. */
export async function toWhatsappJpeg(image: Buffer): Promise<Buffer> {
  return sharp(image, { failOn: "none" })
    .rotate() // honour the camera's orientation before EXIF is dropped
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }) // transparent PNGs would otherwise turn black
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

function filenameFor(url: string): string {
  const base = new URL(url).pathname.split("/").pop() ?? "photo";
  return `${base.replace(/\.[a-z0-9]+$/i, "") || "photo"}.jpg`;
}

/**
 * The photo at url, ready to send. Cached by URL — uploads are never
 * overwritten in place (each gets a fresh key) — and a failure is not cached,
 * so asking again retries.
 */
export function preparePhoto(url: string, fetchImpl: Fetch = fetch): Promise<PreparedPhoto> {
  const cached = cache.get(url);
  if (cached) {
    // Most recently used goes to the back, so the oldest are evicted first.
    cache.delete(url);
    cache.set(url, cached);
    return cached;
  }
  const prepared = (async () => {
    const jpeg = await toWhatsappJpeg(await download(url, fetchImpl));
    return { mimetype: "image/jpeg" as const, data: jpeg.toString("base64"), filename: filenameFor(url), bytes: jpeg.length };
  })();
  cache.set(url, prepared);
  prepared.catch(() => cache.delete(url));
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return prepared;
}

/**
 * Prepares several photos at once (a few at a time, to be kind to r2.dev), in
 * the order given. A photo that fails comes back as its error, not a throw, so
 * one bad upload never stops the rest.
 */
export async function prepareAll(
  urls: string[],
  fetchImpl: Fetch = fetch,
  concurrency = 4,
): Promise<(PreparedPhoto | Error)[]> {
  const results = new Array<PreparedPhoto | Error>(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const index = next++;
      results[index] = await preparePhoto(urls[index]!, fetchImpl).catch((error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}
