import { directionsUrl, distanceKm, mapsUrl } from "@forest-creek/db";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { propertySlug, resolveProperty } from "./tools";

/**
 * Where a property is and how to get there, as staff entered it (Properties →
 * Getting here). The assistants used to be told to state no distances at all,
 * because they had none; now they quote exactly these and nothing else.
 */
export const getDirectionsTool = createTool({
  id: "get-directions",
  description:
    "Where a property is and how to get there: its address, the lodge's own directions, distances from towns as the lodge gives them, " +
    "and Google Maps links for the place and for turn-by-turn directions. When the guest has shared their location (a message like " +
    "\"📍 My location: -18.97, 32.67\"), pass those numbers as fromLatitude/fromLongitude for the distance from them and directions from there.",
  inputSchema: z.object({
    propertySlug,
    fromLatitude: z.number().min(-90).max(90).optional().describe("The guest's shared location, if they sent one"),
    fromLongitude: z.number().min(-180).max(180).optional(),
  }),
  execute: async ({ propertySlug: slug, fromLatitude, fromLongitude }) => {
    const resolved = await resolveProperty(slug);
    if ("error" in resolved) return { ok: false as const, error: resolved.error };
    const { property } = resolved;

    const pin =
      property.latitude != null && property.longitude != null
        ? { latitude: property.latitude, longitude: property.longitude }
        : null;
    const guest =
      fromLatitude !== undefined && fromLongitude !== undefined ? { latitude: fromLatitude, longitude: fromLongitude } : undefined;

    const nothingEntered = !pin && !property.directions && property.travelDistances.length === 0;
    return {
      ok: true as const,
      property: property.name,
      address: property.location,
      directions: property.directions,
      distancesFromTowns: property.travelDistances,
      mapsUrl: pin ? mapsUrl(pin) : null,
      directionsUrl: pin ? directionsUrl(pin, guest) : null,
      // Straight line only: roads are longer, and the link gives the drive.
      straightLineKmFromGuest: pin && guest ? Math.round(distanceKm(guest, pin)) : null,
      howToReply: nothingEntered
        ? `The lodge hasn't added directions yet. Give the address, say the team can guide them, and offer the number ${property.phone}. Never guess a distance, a route or a drive time.`
        : "Give the address and the lodge's own directions in your words, then the links exactly as returned (directionsUrl opens turn-by-turn directions on their phone). " +
          "Quote distances only as distancesFromTowns gives them. If straightLineKmFromGuest is set, say it is about that many km in a straight line and that the road is longer — the directions link gives the real drive. " +
          "Never invent a distance, a drive time or a route.",
    };
  },
});
