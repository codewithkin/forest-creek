/**
 * Google Maps addresses for a property's pin — the same three the server's
 * packages/db/src/getting-here.ts builds for the assistants, so a guest on the
 * page and a guest in the chat land on the same place.
 */
type Pin = { latitude: number; longitude: number };

const at = (pin: Pin) => `${pin.latitude},${pin.longitude}`;

export const mapsUrl = (pin: Pin) => `https://www.google.com/maps/search/?api=1&query=${at(pin)}`;
export const directionsUrl = (pin: Pin) => `https://www.google.com/maps/dir/?api=1&destination=${at(pin)}`;
export const mapEmbedUrl = (pin: Pin) => `https://maps.google.com/maps?q=${at(pin)}&z=14&output=embed`;

/** The pin when a property has both coordinates. */
export function pinOf(property: { latitude: number | null; longitude: number | null }): Pin | null {
  return property.latitude != null && property.longitude != null
    ? { latitude: property.latitude, longitude: property.longitude }
    : null;
}
