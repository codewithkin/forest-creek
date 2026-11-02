import ReportsView from "@/components/dashboard/reports-view";

type Props = { searchParams: Promise<{ period?: string; date?: string }> };

const isPeriod = (value: string | undefined): value is "day" | "week" | "month" =>
  value === "day" || value === "week" || value === "month";

// The emailed reports link here with their period and date.
export default async function DashboardReportsPage({ searchParams }: Props) {
  const { period, date } = await searchParams;
  return <ReportsView initialPeriod={isPeriod(period) ? period : undefined} initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined} />;
}
