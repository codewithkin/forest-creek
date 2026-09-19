import { reveal } from "@/components/motion/reveal";
import { api } from "@/lib/api";

import GalleryGrid, { type GalleryPhoto } from "./gallery-grid";

/**
 * Every photo we already hold, sorted into what guests actually ask about —
 * the rooms, the grounds, the things to do — behind category pills.
 */
export default async function GallerySection() {
  const [properties, rooms, activities] = await Promise.all([
    api.properties.list.query(),
    api.rooms.list.query(),
    api.activities.list.query(),
  ]);

  const photos: GalleryPhoto[] = [];
  const seen = new Set<string>();
  const add = (src: string, category: GalleryPhoto["category"], caption: string) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    photos.push({ src, category, caption });
  };

  for (const property of properties) {
    add(property.heroImage, "grounds", property.name);
    for (const image of property.gallery) add(image, "grounds", property.name);
  }
  for (const room of rooms) {
    const images = room.images.length > 0 ? room.images : [room.image];
    for (const image of images) add(image, "rooms", room.name);
  }
  for (const activity of activities) add(activity.image, "experiences", activity.name);

  if (photos.length === 0) return null;

  return (
    <section id="gallery" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <span {...reveal("up")} className="text-xs tracking-[0.2em] text-accent uppercase">
            Gallery
          </span>
          <h2
            {...reveal("up", 80)}
            className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-6xl"
          >
            The Vumba, <em className="text-accent">in light</em>
          </h2>
        </div>
        <div {...reveal("up", 160)}>
          <GalleryGrid photos={photos} />
        </div>
      </div>
    </section>
  );
}
