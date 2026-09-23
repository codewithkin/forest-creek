import { isFilterKey } from "@/components/dashboard/booking-filters";
import BookingsTable from "@/components/dashboard/bookings-table";

type Props = { searchParams: Promise<{ filter?: string }> };

// The filter comes in as a prop, read here on the server, so the table needs
// no useSearchParams (and no Suspense boundary) to open on a given tab — the
// attention panel links to ?filter=attention.
export default async function DashboardBookingsPage({ searchParams }: Props) {
  const { filter } = await searchParams;
  return <BookingsTable initialFilter={isFilterKey(filter) ? filter : "all"} />;
}
