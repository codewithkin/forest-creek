/**
 * A location a guest shares on WhatsApp. Its `body` is the map thumbnail's
 * image data, not words, so the pipeline would have fed the model a wall of
 * base64. It becomes one plain line the agent passes to get-directions.
 * Import-free, so it is tested without whatsapp-web.js.
 */
type LocationMessage = {
  type?: string;
  body?: string;
  location?: { latitude?: number | string; longitude?: number | string; description?: string; name?: string; address?: string };
};

export function incomingText(message: LocationMessage): string {
  if (message.type !== "location" || !message.location) return message.body ?? "";
  const latitude = Number(message.location.latitude);
  const longitude = Number(message.location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const label = [message.location.name, message.location.address ?? message.location.description]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(", ")
    .slice(0, 120);
  return `📍 My location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${label ? ` (${label})` : ""}`;
}
