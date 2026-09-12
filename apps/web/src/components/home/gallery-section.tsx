import { mediaUrl } from "@/lib/server-url";

// Captions carried over from the prototype gallery.
const plates = [
  {
    image: "/media/executive-suite.webp",
    caption: "The Executive Suite",
    alt: "Executive suite with arched leather headboard and marble feature wall",
  },
  {
    image: "/media/ensuite-bathroom.webp",
    caption: "En-suite Sanctuaries",
    alt: "En-suite bathroom with freestanding tub and walk-in shower",
  },
  {
    image: "/media/family-room.webp",
    caption: "The Family Room",
    alt: "Family room with tufted headboard and mirrored wardrobe",
  },
  {
    image: "/media/garden-braai.webp",
    caption: "The Garden & the Mountain",
    alt: "Garden braai station and lawn below the Vumba mountains",
  },
];

export default function GallerySection() {
  return (
    <section id="gallery" className="scroll-mt-20 border-t border-border/60 bg-popover py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <span className="text-xs tracking-[0.2em] text-accent uppercase">Gallery</span>
          <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">The lodge, in light</h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plates.map((plate) => (
            <figure key={plate.image} className="group">
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <img
                  src={mediaUrl(plate.image)}
                  alt={plate.alt}
                  className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <figcaption className="mt-3 text-sm text-muted-foreground">
                {plate.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
