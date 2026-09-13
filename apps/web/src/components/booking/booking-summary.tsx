import type { BookableActivity, BookableRoom } from "./types";
import { countNights } from "./types";

type Props = {
  propertyName: string | undefined;
  room: BookableRoom | undefined;
  checkIn: string;
  checkOut: string;
  guests: number;
  activities: BookableActivity[];
};

export default function BookingSummary({ propertyName, room, checkIn, checkOut, guests, activities }: Props) {
  const nights = countNights(checkIn, checkOut);
  const subtotal = room ? room.pricePerNight * nights : 0;
  const experiences = activities.reduce((sum, activity) => sum + activity.price, 0);

  return (
    <aside className="rounded-2xl border border-border/70 bg-card p-6 lg:sticky lg:top-24">
      <h2 className="font-display text-2xl">Your stay</h2>

      {!room && <p className="mt-4 text-sm text-muted-foreground">Choose a room to begin.</p>}

      {room && (
        <dl className="mt-5 space-y-3 text-sm">
          {propertyName && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Property</dt>
              <dd className="text-right">{propertyName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Room</dt>
            <dd className="text-right">{room.name}</dd>
          </div>
          {nights > 0 && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Dates</dt>
                <dd className="text-right">
                  {checkIn} → {checkOut}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Guests</dt>
                <dd className="text-right">{guests}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border/70 pt-3">
                <dt className="text-muted-foreground">
                  ${room.pricePerNight} × {nights} {nights === 1 ? "night" : "nights"}
                </dt>
                <dd className="text-right">${subtotal}</dd>
              </div>
            </>
          )}

          {activities.map((activity) => (
            <div key={activity.id} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{activity.name}</dt>
              <dd className="text-right">${activity.price}</dd>
            </div>
          ))}

          {nights > 0 && (
            <div className="flex items-baseline justify-between gap-4 border-t border-border/70 pt-4">
              <dt className="font-display text-lg">Total</dt>
              <dd className="font-display text-2xl text-accent">${subtotal + experiences}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        The final step sends a real Ecocash or OneMoney prompt to your phone — your stay is confirmed
        once you approve it.
      </p>
    </aside>
  );
}
