import { beforeEach, describe, expect, test } from "bun:test";
import sharp from "sharp";

import { clearPhotoCache, prepareAll, preparePhoto } from "./photo-media";

/** Real images, made here: a big transparent PNG like the main cover, and a WebP like the seeded photos. */
const bigPng = await sharp({
  create: { width: 4000, height: 3000, channels: 4, background: { r: 30, g: 90, b: 60, alpha: 0.5 } },
})
  .png()
  .toBuffer();
const webp = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#336633" } })
  .webp()
  .toBuffer();

let requests: string[] = [];
const fakeFetch = async (url: string) => {
  requests.push(url);
  if (url.endsWith("cover.png")) return new Response(bigPng, { headers: { "content-type": "image/png" } });
  if (url.endsWith("room.webp")) return new Response(webp, { headers: { "content-type": "image/webp" } });
  if (url.endsWith("page.html")) return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  return new Response("missing", { status: 404 });
};

beforeEach(() => {
  clearPhotoCache();
  requests = [];
});

describe("preparePhoto", () => {
  test("a large PNG becomes a WhatsApp-sized JPEG", async () => {
    const photo = await preparePhoto("https://r2.example/properties/main/cover.png", fakeFetch);
    expect(photo.mimetype).toBe("image/jpeg");
    expect(photo.filename).toBe("cover.jpg");
    const meta = await sharp(Buffer.from(photo.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
    // Far smaller than what was stored.
    expect(photo.bytes).toBeLessThan(bigPng.length / 4);
  });

  test("a WebP (which WhatsApp won't take as a photo) becomes a JPEG, not enlarged", async () => {
    const photo = await preparePhoto("https://api.example/media/room.webp", fakeFetch);
    const meta = await sharp(Buffer.from(photo.data, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(800);
  });

  test("the same photo is prepared once, then served from memory", async () => {
    await preparePhoto("https://r2.example/properties/main/cover.png", fakeFetch);
    await preparePhoto("https://r2.example/properties/main/cover.png", fakeFetch);
    expect(requests).toHaveLength(1);
  });

  test("a failure is not remembered, so asking again retries", async () => {
    await expect(preparePhoto("https://r2.example/gone.jpg", fakeFetch)).rejects.toThrow(/404/);
    await expect(preparePhoto("https://r2.example/gone.jpg", fakeFetch)).rejects.toThrow(/404/);
    expect(requests).toHaveLength(2);
  });

  test("a page that isn't an image is refused before decoding", async () => {
    await expect(preparePhoto("https://r2.example/page.html", fakeFetch)).rejects.toThrow(/not an image/);
  });
});

describe("prepareAll", () => {
  test("keeps the order, and one bad photo never stops the others", async () => {
    const results = await prepareAll(
      ["https://r2.example/cover.png", "https://r2.example/gone.jpg", "https://r2.example/room.webp"],
      fakeFetch,
    );
    expect(results[0]).not.toBeInstanceOf(Error);
    expect(results[1]).toBeInstanceOf(Error);
    expect((results[2] as { filename: string }).filename).toBe("room.jpg");
  });
});
