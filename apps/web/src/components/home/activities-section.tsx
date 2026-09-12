import ActivityCard from "@/components/activity-card";
import { api } from "@/lib/api";

export default async function ActivitiesSection() {
  const activities = await api.activities.list.query();

  return (
    <section id="activities" className="scroll-mt-20 border-t border-border/60 bg-popover py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <span className="text-xs tracking-[0.2em] text-accent uppercase">Activities</span>
          <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">
            Days shaped by the mountain
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            Add an experience to your stay — priced per booking, arranged by the people who live
            here.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      </div>
    </section>
  );
}
