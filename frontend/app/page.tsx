import Navbar from "@/components/landing/Navbar"
import Hero from "@/components/landing/Hero"
import ProblemSection from "@/components/landing/ProblemSection"
import SolutionSection from "@/components/landing/SolutionSection"
import FeaturesSection from "@/components/landing/FeaturesSection"
import HowItWorks from "@/components/landing/HowItWorks"
import CTASection from "@/components/landing/CTASection"
import Footer from "@/components/landing/Footer"

export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <HowItWorks />
        <CTASection />
      </main>
      <Footer />
    </>
  )
}
