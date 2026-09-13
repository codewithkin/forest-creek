import { Skeleton } from "@/components/brand/state";

export default function PropertyLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading property</span>
      <div className="flex min-h-[70svh] flex-col items-center justify-center gap-5 bg-secondary/30 px-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-14 w-full max-w-xl" />
        <Skeleton className="h-6 w-full max-w-sm" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="mt-6 h-12 w-48 rounded-full" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-24 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-4">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
