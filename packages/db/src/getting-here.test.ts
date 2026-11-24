import { describe, expect, test } from "bun:test";

import { directionsUrl, distanceKm, mapEmbedUrl, mapsUrl, parseMapPin, travelDistanceLines } from "./getting-here";

describe("parseMapPin", () => {
  test("plain coordinates, as Google Maps copies them", () => {
    expect(parseMapPin("-19.0812, 32.7465")).toEqual({ latitude: -19.0812, longitude: 32.7465 });
    expect(parseMapPin(" -19.0812 32.7465 ")).toEqual({ latitude: -19.0812, longitude: 32.7465 });
  });

  test("a place link uses the place's own pin, not where the map was centred", () => {
    const link =
      "https://www.google.com/maps/place/Forest+Creek/@-19.10,32.70,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-19.0812!4d32.7465";
    expect(parseMapPin(link)).toEqual({ latitude: -19.0812, longitude: 32.7465 });
  });

  test("a query link, and a map centred on the place", () => {
    expect(parseMapPin("https://maps.google.com/?q=-19.0812,32.7465")).toEqual({ latitude: -19.0812, longitude: 32.7465 });
    expect(parseMapPin("https://www.google.com/maps/@-19.0812,32.7465,17z")).toEqual({ latitude: -19.0812, longitude: 32.7465 });
  });

  test("nothing that is not a real pin", () => {
    expect(parseMapPin("")).toBeNull();
    expect(parseMapPin("261 Rhine Farm, Lower Vumba")).toBeNull();
    expect(parseMapPin("-119.0, 32.7")).toBeNull();
    expect(parseMapPin("0, 0")).toBeNull();
    // A share link carries no coordinates: staff must open it and copy the pin.
    expect(parseMapPin("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
  });
});

describe("distances and links", () => {
  test("straight-line distance: Mutare to Harare is about 210 km", () => {
    const mutare = { latitude: -18.9707, longitude: 32.6709 };
    const harare = { latitude: -17.8292, longitude: 31.0522 };
    expect(Math.round(distanceKm(mutare, harare))).toBeGreaterThan(200);
    expect(Math.round(distanceKm(mutare, harare))).toBeLessThan(220);
    expect(distanceKm(mutare, mutare)).toBe(0);
  });

  test("maps, directions (from the guest's pin when known) and the embed", () => {
    const lodge = { latitude: -19.0812, longitude: 32.7465 };
    expect(mapsUrl(lodge)).toBe("https://www.google.com/maps/search/?api=1&query=-19.0812,32.7465");
    expect(directionsUrl(lodge)).toBe("https://www.google.com/maps/dir/?api=1&destination=-19.0812,32.7465");
    expect(directionsUrl(lodge, { latitude: -18.97, longitude: 32.67 })).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=-18.97,32.67&destination=-19.0812,32.7465",
    );
    expect(mapEmbedUrl(lodge)).toContain("output=embed");
  });

  test("distance lines: one per line, bullets and blanks dropped", () => {
    expect(travelDistanceLines("- Mutare city centre — 28 km\n\n• Harare — 290 km, about 4 hours\n")).toEqual([
      "Mutare city centre — 28 km",
      "Harare — 290 km, about 4 hours",
    ]);
  });
});
