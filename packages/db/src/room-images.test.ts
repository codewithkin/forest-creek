import { describe, expect, test } from "bun:test";

import { roomImages, syncRoomImages } from "./room-images";

describe("syncRoomImages", () => {
  test("a gallery sets the cover to its first photo", () => {
    expect(syncRoomImages({ image: "/old.webp", images: ["/a.webp", "/b.webp"] })).toEqual({
      image: "/a.webp",
      images: ["/a.webp", "/b.webp"],
    });
  });

  test("drops duplicate photos, keeping the first position", () => {
    expect(syncRoomImages({ images: ["/a.webp", "/b.webp", "/a.webp"] }).images).toEqual([
      "/a.webp",
      "/b.webp",
    ]);
  });

  test("a lone cover becomes a one-photo gallery", () => {
    expect(syncRoomImages<{ image?: string; images?: string[] }>({ image: "/a.webp" })).toEqual({ image: "/a.webp", images: ["/a.webp"] });
  });

  test("an update that touches neither field leaves both alone", () => {
    expect(syncRoomImages({ name: "Suite" } as { name: string; image?: string })).toEqual({
      name: "Suite",
    });
  });

  test("an emptied gallery keeps the previous cover rather than blanking it", () => {
    expect(syncRoomImages({ image: "/a.webp", images: [] }).image).toBe("/a.webp");
  });
});

describe("roomImages", () => {
  test("falls back to the cover for rooms saved before galleries", () => {
    expect(roomImages({ image: "/a.webp", images: [] })).toEqual(["/a.webp"]);
  });

  test("returns the gallery when present", () => {
    expect(roomImages({ image: "/a.webp", images: ["/a.webp", "/b.webp"] })).toHaveLength(2);
  });
});
