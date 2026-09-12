import { BedDouble, Users } from "lucide-react";

import { mediaUrl } from "@/lib/server-url";

export type RoomSummary = {
  id: string;
  tier: string;
  name: string;
  description: string;
  pricePerNight: number;
  capacity: number;
  bedType: string;
  amenities: string[];
  image: string;
};

export default function RoomCard({ room }: { room: RoomSummary }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={mediaUrl(room.image)}
          alt={room.name}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-2xl">{room.name}</h3>
          <p className="shrink-0 text-right">
            <span className="font-display text-2xl text-accent">${room.pricePerNight}</span>
            <span className="block text-xs text-muted-foreground">per night</span>
          </p>
        </div>

        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {room.description}
        </p>

        <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-accent" />
            Sleeps {room.capacity}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BedDouble className="h-3.5 w-3.5 text-accent" />
            {room.bedType}
          </span>
        </div>

        {room.amenities.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {room.amenities.map((amenity) => (
              <li
                key={amenity}
                className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground"
              >
                {amenity}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
