import ActivitiesSection from "@/components/home/activities-section";
import ClosingCta from "@/components/home/closing-cta";
import GallerySection from "@/components/home/gallery-section";
import Hero from "@/components/home/hero";
import RoomsSection from "@/components/home/rooms-section";
import StorySection from "@/components/home/story-section";

// Rendered per request, never prerendered: rooms, rates and activities come from
// the API, which is not running during the image build and whose rows change
// without a redeploy.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <Hero />
      <RoomsSection />
      <ActivitiesSection />
      <StorySection />
      <GallerySection />
      <ClosingCta />
    </>
  );
}
