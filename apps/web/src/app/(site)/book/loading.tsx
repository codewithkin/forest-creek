import { Skeleton } from "@/components/brand/state";

export default function BookLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-6xl px-5 py-16">
      <span className="sr-only">Loading booking</span>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full" />
      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="flex gap-4 overflow-hidden border-b border-border/60 pb-5">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-6 w-24 shrink-0" />
            ))}
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="aspect-[4/3] w-full rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
