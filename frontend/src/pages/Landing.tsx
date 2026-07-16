import { Hero } from "@/types/components/landing/Hero";
import { LogoCloud } from "@/types/components/landing/LogoCloud";
import { FeatureShowcase } from "@/types/components/landing/FeatureShowcase";
import { HowItWorks } from "@/types/components/landing/HowItWorks";
import { BentoGrid } from "@/types/components/landing/BentoGrid";
import { Testimonials } from "@/types/components/landing/Testimonials";
import { CtaSection } from "@/types/components/landing/CtaSection";
import { Footer } from "@/types/components/landing/Footer";

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      <Hero />
      <LogoCloud />
      <FeatureShowcase />
      <HowItWorks />
      <BentoGrid />
      <Testimonials />
      <CtaSection />
      <Footer />
    </div>
  );
}
