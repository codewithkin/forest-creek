import { Skeleton } from "@/components/brand/state";

export default function PlacesLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-6xl px-5 pt-14 pb-24 sm:pt-20">
      <span className="sr-only">Loading places</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-5 h-12 w-full max-w-lg" />
      <Skeleton className="mt-4 h-4 w-full max-w-md" />
      <Skeleton className="mt-10 h-16 w-full rounded-2xl" />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="space-y-2 rounded-[1.4rem] border border-border/50 p-2">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
