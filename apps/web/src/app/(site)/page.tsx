import ClosingCta from "@/components/home/closing-cta";
import Hero from "@/components/home/hero";
import Marquee from "@/components/home/marquee";
import PropertiesSection from "@/components/home/properties-section";
import StorySection from "@/components/home/story-section";

// Rendered per request, never prerendered: properties come from the API, which
// is not running during the image build and whose rows change without a deploy.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee />
      <PropertiesSection />
      <StorySection />
      <ClosingCta />
    </>
  );
}
