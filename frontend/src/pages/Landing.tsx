import { Hero } from '@/components/landing/Hero';
import { LogoCloud } from '@/components/landing/LogoCloud';
import { FeatureShowcase } from '@/components/landing/FeatureShowcase';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { BentoGrid } from '@/components/landing/BentoGrid';
import { Testimonials } from '@/components/landing/Testimonials';
import { CtaSection } from '@/components/landing/CtaSection';
import { Footer } from '@/components/landing/Footer';

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
