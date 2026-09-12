import RoomCard from "@/components/room-card";
import { api } from "@/lib/api";

export default async function RoomsSection() {
  const rooms = await api.rooms.list.query();

  return (
    <section id="rooms" className="scroll-mt-20 border-t border-border/60 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <span className="text-xs tracking-[0.2em] text-accent uppercase">Rooms</span>
          <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">
            Rest beneath the canopy
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            Three ways to stay, each one opening onto the green of the Vumba.
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      </div>
    </section>
  );
}
