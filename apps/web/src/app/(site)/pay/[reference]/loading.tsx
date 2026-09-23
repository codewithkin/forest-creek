import { Skeleton } from "@/components/brand/state";

export default function PayLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-2xl px-5 py-16">
      <span className="sr-only">Loading your booking</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-12 w-56 max-w-full" />
      <Skeleton className="mt-10 h-48 w-full rounded-2xl" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
