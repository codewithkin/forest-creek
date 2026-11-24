import { afterAll, describe, expect, test } from "bun:test";

import { createProperty, prisma, updateProperty } from "./index";

const SLUG = "getting-here-test";
afterAll(() => prisma.property.deleteMany({ where: { slug: SLUG } }));

describe("saving where a property is", () => {
  test("a pasted Google Maps link becomes the pin; empty clears it; nonsense is refused", async () => {
    await prisma.property.deleteMany({ where: { slug: SLUG } });
    const property = await createProperty({
      slug: SLUG, name: "Pin House", tagline: "-", description: "-", location: "-", phone: "-",
      email: "pin@example.com", heroImage: "/media/x.jpg", gallery: [], amenities: [], sortOrder: 999,
      mapPin: "https://www.google.com/maps/place/X/@-19.1,32.7,15z/data=!3d-19.0812!4d32.7465",
      travelDistances: ["Mutare city centre — 28 km"], breakfastIncluded: true,
    });
    expect(property).toMatchObject({ latitude: -19.0812, longitude: 32.7465, breakfastIncluded: true });
    expect(property.travelDistances).toEqual(["Mutare city centre — 28 km"]);

    // Saving other fields leaves the pin alone.
    expect(await updateProperty({ id: property.id, tagline: "New" })).toMatchObject({ latitude: -19.0812 });
    expect(await updateProperty({ id: property.id, mapPin: "" })).toMatchObject({ latitude: null, longitude: null });
    expect(() => updateProperty({ id: property.id, mapPin: "somewhere nice" })).toThrow("isn't a map pin");
  });
});
