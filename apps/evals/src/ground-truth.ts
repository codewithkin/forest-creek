import { brand } from "@forest-creek/ai/brand";
import { bookingPageUrl } from "@forest-creek/ai/links";
import {
  getActivities,
  getProperties,
  getRooms,
  PAYMENT_FALLBACK_INSTRUCTIONS,
} from "@forest-creek/db";

import type { GroundTruth } from "./checks";

/** Everything the assistants may truthfully say, as of right now. */
export async function loadGroundTruth(): Promise<GroundTruth> {
  const properties = await getProperties();
  const rooms: GroundTruth["rooms"] = [];
  const activities: GroundTruth["activities"] = [];

  for (const property of properties) {
    for (const room of await getRooms(property.id)) {
      rooms.push({
        property: property.name,
        name: room.name,
        tier: room.tier,
        rate: room.pricePerNight,
        sleeps: room.capacity,
        bedType: room.bedType,
        description: room.description,
        amenities: room.amenities,
      });
    }
    for (const activity of await getActivities(property.id)) {
      activities.push({
        property: property.name,
        name: activity.name,
        price: activity.price,
        description: activity.description,
      });
    }
  }

  return {
    brand,
    bookingPageUrl,
    paymentFallback: PAYMENT_FALLBACK_INSTRUCTIONS,
    referenceFormat: "FC- followed by six capital letters and digits, e.g. as returned by create-booking",
    properties: properties.map((property) => ({
      slug: property.slug,
      name: property.name,
      tagline: property.tagline,
      description: property.description,
      location: property.location,
      phone: property.phone,
      email: property.email,
      amenities: property.amenities,
    })),
    rooms,
    activities,
    paymentInstructions: properties
      .map((property) => property.paymentInstructions)
      .filter((instructions): instructions is string => Boolean(instructions)),
  };
}
