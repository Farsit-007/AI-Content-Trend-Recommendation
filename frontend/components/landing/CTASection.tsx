import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export default function CTASection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-600/10 via-card to-indigo-600/10 p-12 text-center">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(124,58,237,0.08),transparent)]" />
          </div>

          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Ready to stop guessing and start{" "}
              <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                creating?
              </span>
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
              TrendBridge gives the Programming Hero marketing team a full week of content ideas —
              personalized, platform-specific, in Banglish — in 5 minutes. Zero cost. Always on.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="gap-2 bg-violet-600 px-8 text-white hover:bg-violet-700"
              >
                See the Demo
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="px-8">
                View on GitHub
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              {[
                "✓ $0 AI & API cost",
                "✓ MongoDB Atlas Vector Search",
                "✓ 4 RAG flows",
                "✓ 3 platforms in one dashboard",
              ].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
