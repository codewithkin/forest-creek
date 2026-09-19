// Import-free so it can be unit tested without a database or env.

/**
 * Keeps `image` (the cover every older reader uses) and `images` (the gallery)
 * in step: a gallery sets the cover to its first photo, and a lone cover
 * becomes a one-photo gallery.
 */
export function syncRoomImages<T extends { image?: string; images?: string[] }>(data: T): T {
  if (data.images !== undefined) {
    const images = [...new Set(data.images)];
    return { ...data, images, image: images[0] ?? data.image ?? "" };
  }
  if (data.image) return { ...data, images: [data.image] };
  return data;
}

/** A room's photos, cover first, for rows written before galleries existed too. */
export function roomImages(room: { image: string; images: string[] }): string[] {
  if (room.images.length > 0) return room.images;
  return room.image ? [room.image] : [];
}
