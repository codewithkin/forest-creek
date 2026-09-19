/** Re-mounts on every navigation, so each page eases in rather than snapping. */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
