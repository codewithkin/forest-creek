import { Skeleton } from "@/components/brand/state";

export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="space-y-8">
      <span className="sr-only">Loading dashboard</span>
      <div>
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}
