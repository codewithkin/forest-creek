import RoomPhotos from "@/components/gallery/room-photos";

export type ActivitySummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  image: string;
  /** Cover first. Older rows may have only `image`. */
  images?: string[];
};

export function activityPhotos(activity: Pick<ActivitySummary, "image" | "images">): string[] {
  if (activity.images && activity.images.length > 0) return activity.images;
  return activity.image ? [activity.image] : [];
}

export default function ActivityCard({ activity }: { activity: ActivitySummary }) {
  const photos = activityPhotos(activity);
  // A zero price means the experience comes with the stay. Printing "$0" reads
  // as a bug; "Free" is what the lodge actually means by it.
  const free = activity.price === 0;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card transition-all duration-500 hover:-translate-y-1 hover:border-accent/40 hover:shadow-2xl hover:shadow-black/30">
      {photos.length > 0 ? (
        <RoomPhotos images={photos} name={activity.name} />
      ) : (
        <div className="aspect-[4/3] w-full bg-secondary" />
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-xl">{activity.name}</h3>
          <span
            className={`shrink-0 font-display text-xl ${free ? "text-emerald-300" : "text-accent"}`}
          >
            {free ? "Free" : `$${activity.price}`}
          </span>
        </div>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {activity.description}
        </p>
        {free && (
          <p className="mt-4 text-xs tracking-wide text-emerald-300/80 uppercase">
            Included in your stay
          </p>
        )}
      </div>
    </article>
  );
}
