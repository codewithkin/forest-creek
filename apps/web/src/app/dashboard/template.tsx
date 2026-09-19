/** Dashboard screens fade in on navigation, matching the public site. */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
