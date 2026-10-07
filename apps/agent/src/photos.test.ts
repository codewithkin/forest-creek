import { describe, expect, test } from "bun:test";

import type { PhotoToSend } from "@forest-creek/ai";

import { captionFor, photoNote, photoUrl } from "./photos";

const family = (number: number): PhotoToSend => ({
  path: `/media/family-${number}.jpg`,
  subject: "Family Room at Forest Creek",
  number,
  total: 8,
});

describe("photos on WhatsApp", () => {
  test("uploads are used as they are; seeded /media photos need the API's address", () => {
    expect(photoUrl("https://cdn.example.com/a.jpg", undefined)).toBe("https://cdn.example.com/a.jpg");
    expect(photoUrl("/media/a.jpg", "https://api.forestcreek.co.zw/")).toBe("https://api.forestcreek.co.zw/media/a.jpg");
    expect(photoUrl("/media/a.jpg", undefined)).toBeUndefined();
    expect(photoUrl("not-a-path", "https://api.example.com")).toBeUndefined();
  });

  test("only the first photo of each subject is captioned", () => {
    const sent = [family(1), family(2), { ...family(1), subject: "Forest Creek", total: 4 }];
    expect(captionFor(sent, 0)).toBe("Family Room at Forest Creek");
    expect(captionFor(sent, 1)).toBeUndefined();
    expect(captionFor(sent, 2)).toBe("Forest Creek");
  });

  test("the thread notes what was sent, so 'more' carries on from the right photo", () => {
    expect(photoNote([family(1), family(2), family(3)])).toBe(
      "📷 Sent 3 photos: Family Room at Forest Creek (photos 1–3 of 8)",
    );
    expect(photoNote([family(4)])).toBe("📷 Sent 1 photo: Family Room at Forest Creek (photo 4 of 8)");
    expect(photoNote([])).toBeUndefined();
  });
});
