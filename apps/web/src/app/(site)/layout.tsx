import ConciergeWidget from "@/components/chat/concierge-widget";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="top" className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <ConciergeWidget />
    </div>
  );
}
