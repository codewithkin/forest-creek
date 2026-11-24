/**
 * Where a property is and how to reach it. Import-free, so the parsing and
 * the arithmetic are unit tested without a database.
 */

export type MapPin = { latitude: number; longitude: number };

function pin(latitude: number, longitude: number): MapPin | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
}

/**
 * A map pin from whatever staff paste: "-19.0812, 32.7465", or a Google Maps
 * link — the place's own coordinates ("!3d…!4d…") when the link has them,
 * else a "?q=lat,lng" query, else the "@lat,lng" the map was centred on.
 * Null when nothing in it is a pin.
 */
export function parseMapPin(text: string): MapPin | null {
  const value = decodeURIComponent(text.trim());
  if (!value) return null;

  const place = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (place) return pin(Number(place[1]), Number(place[2]));

  const query = value.match(/[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (query) return pin(Number(query[1]), Number(query[2]));

  const centre = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (centre) return pin(Number(centre[1]), Number(centre[2]));

  const plain = value.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (plain) return pin(Number(plain[1]), Number(plain[2]));

  return null;
}

/** Straight-line distance in km (haversine). Roads are longer; say so wherever it is shown. */
export function distanceKm(from: MapPin, to: MapPin): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const coordinates = (point: MapPin) => `${point.latitude},${point.longitude}`;

/** The place on Google Maps. */
export function mapsUrl(point: MapPin): string {
  return `https://www.google.com/maps/search/?api=1&query=${coordinates(point)}`;
}

/**
 * Turn-by-turn directions on Google Maps. Without a starting point, the phone
 * that opens it starts from where it is.
 */
export function directionsUrl(to: MapPin, from?: MapPin): string {
  const origin = from ? `&origin=${coordinates(from)}` : "";
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${coordinates(to)}`;
}

/** A map to show in the page: no API key needed for this embed. */
export function mapEmbedUrl(point: MapPin): string {
  return `https://maps.google.com/maps?q=${coordinates(point)}&z=14&output=embed`;
}

/** Staff type one distance per line; blank lines and stray bullets are dropped. */
export function travelDistanceLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}
