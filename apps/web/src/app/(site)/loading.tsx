import { Skeleton } from "@/components/brand/state";

export default function SiteLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="flex min-h-[70svh] flex-col items-center justify-center gap-5 bg-secondary/30 px-5">
        <Skeleton className="h-6 w-44 rounded-full" />
        <Skeleton className="h-16 w-full max-w-lg" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="mt-6 h-12 w-48 rounded-full" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-24 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="space-y-4">
            <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
