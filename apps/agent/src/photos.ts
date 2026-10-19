import type { PhotoToSend } from "@forest-creek/ai";

/**
 * Turning the photos send-photos queued into WhatsApp messages. Kept free of
 * whatsapp-web.js, like reply.ts, so it is tested without a browser.
 */

/**
 * Where to fetch a photo. Uploads are absolute (R2); seeded photos are /media
 * paths the API serves, so they need the API's address (SERVER_URL on the
 * agent). Undefined when it cannot be fetched.
 */
export function photoUrl(path: string, apiBase: string | undefined): string | undefined {
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith("/") || !apiBase) return undefined;
  return `${apiBase.replace(/\/$/, "")}${path}`;
}

/**
 * Only the first photo of each subject carries a caption — what it shows — so
 * a batch reads like someone sharing pictures, not a numbered catalogue.
 */
export function captionFor(photos: PhotoToSend[], index: number): string | undefined {
  const photo = photos[index]!;
  const previous = photos[index - 1];
  return previous?.subject === photo.subject ? undefined : photo.subject;
}

// The note both channels save after photos go out lives with the history that replays it.
export { photoNote } from "@forest-creek/ai";
