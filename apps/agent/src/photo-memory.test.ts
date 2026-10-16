import { expect, test } from "bun:test";

import { recentPhotosFor, recordPhotosSent } from "./photo-memory";

test("remembers what each chat was sent, for half an hour", () => {
  const now = Date.now();
  recordPhotosSent("whatsapp:1", ["a.jpg"], now - 40 * 60_000);
  recordPhotosSent("whatsapp:1", ["b.jpg"], now - 5 * 60_000);
  recordPhotosSent("whatsapp:2", ["c.jpg"], now);
  expect(recentPhotosFor("whatsapp:1", now).map((photo) => photo.path)).toEqual(["b.jpg"]);
  expect(recentPhotosFor("whatsapp:2", now).map((photo) => photo.path)).toEqual(["c.jpg"]);
  expect(recentPhotosFor("whatsapp:3", now)).toEqual([]);
});
