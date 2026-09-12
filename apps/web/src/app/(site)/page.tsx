import ActivitiesSection from "@/components/home/activities-section";
import ClosingCta from "@/components/home/closing-cta";
import GallerySection from "@/components/home/gallery-section";
import Hero from "@/components/home/hero";
import RoomsSection from "@/components/home/rooms-section";
import StorySection from "@/components/home/story-section";

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
