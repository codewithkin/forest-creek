import type { Metadata } from "next";

import RoomCard from "@/components/room-card";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Book Your Stay — Forest Creek Lodge",
  description: "Reserve a room at Forest Creek Lodge in the Vumba highlands of Zimbabwe.",
};

export default async function BookPage() {
  const rooms = await api.rooms.list.query();

  return (
    <div className="mx-auto max-w-6xl px-5 py-20">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">Reservations</span>
      <h1 className="mt-4 font-display text-4xl font-light sm:text-5xl">Begin your journey</h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
        Choose the room that suits you, and we will take it from there.
      </p>

      <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </div>
  );
}
