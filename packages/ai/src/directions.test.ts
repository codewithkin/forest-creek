import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { prisma } from "@forest-creek/db";

import { getDirectionsTool } from "./directions";

const SLUG = "directions-test";
const run = (input: object) =>
  (getDirectionsTool.execute as (i: object, c: unknown) => Promise<Record<string, unknown>>)(input, {});

const remove = async () => { await prisma.property.deleteMany({ where: { slug: { startsWith: SLUG } } }); };
beforeAll(async () => {
  await remove();
  const base = { tagline: "-", description: "-", phone: "+263 71 995 6882", email: "d@example.com", heroImage: "/media/x.jpg", sortOrder: 999 };
  await prisma.property.create({
    data: {
      ...base, slug: SLUG, name: "Pin Lodge", location: "261 Rhine Farm, Lower Vumba",
      latitude: -19.0812, longitude: 32.7465, directions: "Take the Vumba Road.",
      travelDistances: ["Mutare city centre — 28 km, about 40 minutes"],
    },
  });
  await prisma.property.create({ data: { ...base, slug: `${SLUG}-bare`, name: "Bare Lodge", location: "Somewhere" } });
});
afterAll(remove);

describe("get-directions", () => {
  test("the lodge's own directions and distances, with map links", async () => {
    const result = await run({ propertySlug: SLUG });
    expect(result).toMatchObject({
      ok: true,
      address: "261 Rhine Farm, Lower Vumba",
      directions: "Take the Vumba Road.",
      distancesFromTowns: ["Mutare city centre — 28 km, about 40 minutes"],
      directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=-19.0812,32.7465",
      straightLineKmFromGuest: null,
    });
  });

  test("from a location the guest shared: a straight-line distance and directions from there", async () => {
    const result = await run({ propertySlug: SLUG, fromLatitude: -18.9707, fromLongitude: 32.6709 });
    expect(result.straightLineKmFromGuest).toBeGreaterThan(10);
    expect(result.straightLineKmFromGuest).toBeLessThan(20);
    expect(String(result.directionsUrl)).toContain("origin=-18.9707,32.6709");
  });

  test("a lodge with nothing entered says so, and gives no link to guess with", async () => {
    const result = await run({ propertySlug: `${SLUG}-bare` });
    expect(result).toMatchObject({ ok: true, mapsUrl: null, directionsUrl: null, distancesFromTowns: [] });
    expect(String(result.howToReply)).toContain("Never guess");
  });
});
