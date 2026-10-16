import { galleryImages, getRooms } from "@forest-creek/db";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { propertyPageUrl } from "./links";
import { propertySlug, resolveProperty } from "./tools";

/**
 * Photos of a property or a room, sent on WhatsApp. The tool cannot send
 * anything itself — packages/ai knows nothing of WhatsApp — so it queues them
 * on the run's request context, and the agent's pipeline sends them right
 * after the reply (apps/agent). Only what this tool queued can ever go out:
 * the model never handles a photo's address.
 */

export const PHOTO_OUTBOX_KEY = "photoOutbox";
/** Photos this guest was sent lately (path and when), put on the request context by the agent. */
export const RECENT_PHOTOS_KEY = "recentPhotos";
export type RecentPhoto = { path: string; sentAt: number };
/** Within this long, the same photos are not sent again unless the guest asked for them again. */
export const RESEND_WINDOW_MS = 30 * 60_000;

/** At most this many in one send, so "all" never floods a chat. */
export const MAX_PHOTOS_PER_SEND = 10;
/** And at most this many in one reply, across several sends (two rooms, say). */
export const MAX_PHOTOS_PER_REPLY = 15;

export type PhotoToSend = {
  /** As stored: an absolute URL (uploads) or a /media/... path the API serves. */
  path: string;
  /** What it shows: "Family Room at Forest Creek", or the property's name. */
  subject: string;
  /** Its place among all of that subject's photos, from 1. */
  number: number;
  total: number;
  /** The property's page, where the guest can see every photo if sending fails. */
  pageUrl?: string;
};

function recentOf(context: unknown): RecentPhoto[] {
  const value = (context as { requestContext?: { get?: (key: string) => unknown } })?.requestContext?.get?.(
    RECENT_PHOTOS_KEY,
  );
  return Array.isArray(value) ? (value as RecentPhoto[]) : [];
}

function outboxOf(context: unknown): PhotoToSend[] | undefined {
  const value = (context as { requestContext?: { get?: (key: string) => unknown } })?.requestContext?.get?.(
    PHOTO_OUTBOX_KEY,
  );
  return Array.isArray(value) ? (value as PhotoToSend[]) : undefined;
}

type Photo = { path: string; subject: string };

/**
 * Everything there is to see of a property: its cover and gallery, then each
 * room's photos. A lodge whose page has only a cover (the main property, live)
 * still shows its rooms when a guest asks for "pictures of the property".
 */
function propertyPhotos(
  property: { name: string; heroImage: string; gallery: string[] },
  rooms: { name: string; image: string; images: string[] }[],
): Photo[] {
  const photos: Photo[] = [];
  const seen = new Set<string>();
  const add = (path: string, subject: string) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    photos.push({ path, subject });
  };
  for (const path of [property.heroImage, ...property.gallery]) add(path, property.name);
  for (const room of rooms) for (const path of galleryImages(room)) add(path, `${room.name} at ${property.name}`);
  return photos;
}

export const sendPhotosTool = createTool({
  id: "send-photos",
  description:
    "Send the guest photos of a property, or of one room at it, on WhatsApp. They arrive as images right after your message. " +
    "A property's photos are its own (cover and gallery) followed by its rooms' photos; pass roomTier for one room only. " +
    "Use it whenever the guest asks to see a place or a room (pictures, photos, 'what does it look like'). " +
    "count is how many the guest asked for: 1 only for 'a photo', 'a picture' or 'one'; 3 for plural 'photos' or 'pictures' with no number, or when they don't say; the number they name; up to 10 for 'all' or 'lots'. " +
    "startAt is 0 the first time; when the guest asks for more, another or the next ones, pass the nextStartAt this tool returned " +
    "(the chat also notes what was sent, e.g. 'photos 1–3 of 8').",
  inputSchema: z.object({
    propertySlug,
    roomTier: z
      .string()
      .min(1)
      .optional()
      .describe("The room's tier from list-rooms. Leave it out for photos of the property itself."),
    count: z.number().int().min(1).max(MAX_PHOTOS_PER_SEND).default(3),
    startAt: z.number().int().min(0).default(0),
    again: z
      .boolean()
      .optional()
      .describe("Only when the guest's latest message clearly asks to see photos they were already sent"),
  }),
  execute: async ({ propertySlug: slug, roomTier, count, startAt, again }, context) => {
    const outbox = outboxOf(context);
    if (!outbox) {
      return {
        ok: false as const,
        error: "Photos can only be sent on WhatsApp. Point the guest to the property's page on the website instead.",
      };
    }

    const resolved = await resolveProperty(slug);
    if ("error" in resolved) return { ok: false as const, error: resolved.error };
    const { property } = resolved;

    const rooms = await getRooms(property.id);
    let subject = property.name;
    let photos = propertyPhotos(property, rooms);
    if (roomTier) {
      const room = rooms.find((candidate) => candidate.tier === roomTier && candidate.active);
      if (!room) {
        return {
          ok: false as const,
          error: `${property.name} has no room "${roomTier}". Call list-rooms for the real ones.`,
        };
      }
      subject = `${room.name} at ${property.name}`;
      photos = galleryImages(room).map((path) => ({ path, subject }));
    }

    if (photos.length === 0) {
      return {
        ok: true as const,
        subject,
        sending: 0,
        totalPhotos: 0,
        howToReply: "There are no photos of this yet. Say so simply, and offer photos of the property or another room instead.",
      };
    }
    if (startAt >= photos.length) {
      return {
        ok: true as const,
        subject,
        sending: 0,
        totalPhotos: photos.length,
        howToReply: `Every photo of ${subject} (${photos.length}) has already been sent. Say so warmly and offer photos of another room or the property.`,
      };
    }

    const room = Math.max(0, MAX_PHOTOS_PER_REPLY - outbox.length);
    const batch = photos.slice(startAt, startAt + Math.min(count, room));

    // The model once sent the same photos three times in a row — to "Hi", and
    // to a message meant for a member of staff. Recently sent photos only go
    // out again when the guest asked for them again.
    const recent = recentOf(context).filter((photo) => Date.now() - photo.sentAt < RESEND_WINDOW_MS);
    const sentBefore = batch.filter((photo) => recent.some((sent) => sent.path === photo.path));
    if (!again && batch.length > 0 && sentBefore.length === batch.length) {
      const minutes = Math.max(1, Math.round((Date.now() - Math.max(...recent.map((photo) => photo.sentAt))) / 60_000));
      return {
        ok: true as const,
        subject,
        sending: 0,
        alreadySent: true as const,
        sentMinutesAgo: minutes,
        howToReply:
          `The guest already received these photos ${minutes} minute${minutes === 1 ? "" : "s"} ago, so nothing was sent. ` +
          "Do not mention photos unless the guest asked about them; just answer what they actually said. " +
          "Only if their latest message clearly asks to see the same photos again, call send-photos once more with again: true.",
      };
    }
    batch.forEach((photo, index) =>
      outbox.push({
        path: photo.path,
        subject: photo.subject,
        number: startAt + index + 1,
        total: photos.length,
        pageUrl: propertyPageUrl(property.slug),
      }),
    );
    const shows = [...new Set(batch.map((photo) => photo.subject))];
    const next = startAt + batch.length;
    const remaining = photos.length - next;

    return {
      ok: true as const,
      subject,
      // What this batch shows — the property itself and/or its rooms.
      shows,
      sending: batch.length,
      photoNumbers: batch.length === 1 ? `${startAt + 1}` : `${startAt + 1}–${next}`,
      totalPhotos: photos.length,
      nextStartAt: remaining > 0 ? next : null,
      howToReply:
        "The photos arrive on their own right after your message. Write one or two natural lines handing them over " +
        `(e.g. "Here ${batch.length === 1 ? "is one" : `are ${batch.length}`} of ${shows.join(" and ")}"). Don't describe each photo, number them or paste any link.` +
        (remaining > 0 ? ` There ${remaining === 1 ? "is 1 more" : `are ${remaining} more`} — offer to send ${remaining === 1 ? "it" : "them"}.` : ""),
    };
  },
});
