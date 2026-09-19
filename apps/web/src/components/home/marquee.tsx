import { Sparkle } from "lucide-react";

const words = [
  "Mist through the msasa",
  "Woodsmoke evenings",
  "Garden braai",
  "Forest walks",
  "Valley views",
  "Birdsong at dawn",
  "Hosted by hand",
];

/** A slow ribbon of what the Vumba feels like; it pauses under the cursor. */
export default function Marquee() {
  const row = [...words, ...words];
  return (
    <div className="group relative mt-10 overflow-hidden border-y border-border/60 bg-popover/60 py-5 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max animate-marquee gap-10 group-hover:[animation-play-state:paused]">
        {row.map((word, index) => (
          <span
            key={`${word}-${index}`}
            aria-hidden={index >= words.length}
            className="inline-flex items-center gap-10 font-display text-2xl whitespace-nowrap text-foreground/80 italic sm:text-3xl"
          >
            {word}
            <Sparkle className="size-4 text-accent" />
          </span>
        ))}
      </div>
    </div>
  );
}
