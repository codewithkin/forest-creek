"use client";

import { Trees } from "lucide-react";
import { useState } from "react";

import { mediaUrl } from "@/lib/server-url";

export type ActivitySummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  image: string;
};

export default function ActivityCard({ activity }: { activity: ActivitySummary }) {
  // Not every activity in the prototype export shipped with a photo; a missing
  // one should read as a plate, not a broken image.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="group overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="relative aspect-[3/2] overflow-hidden bg-secondary">
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <Trees className="h-10 w-10 text-accent/40" />
          </div>
        ) : (
          <img
            src={mediaUrl(activity.image)}
            alt={activity.name}
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
      </div>

      <div className="p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-xl">{activity.name}</h3>
          <span className="shrink-0 font-display text-xl text-accent">${activity.price}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{activity.description}</p>
      </div>
    </article>
  );
}
