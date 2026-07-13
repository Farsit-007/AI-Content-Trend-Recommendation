import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"

export default function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
      {/* Gradient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(124,58,237,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_80%_60%,rgba(99,102,241,0.08),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
          <Sparkles className="size-3.5" />
          AI Content &amp; Trend Intelligence Platform
        </div>

        <h1 className="mb-6 text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
            Growth
          </span>
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            {" "}Studio
          </span>
        </h1>

        <p className="mx-auto mb-4 max-w-2xl text-xl text-muted-foreground sm:text-2xl">
          Combines what&apos;s trending in tech with what works on{" "}
          <span className="font-semibold text-foreground">YOUR channels</span>
        </p>
        <p className="mx-auto mb-10 max-w-xl text-base text-muted-foreground">
          Generates a full week of content across Facebook, YouTube, and LinkedIn in 5 minutes — for free.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="gap-2 bg-violet-600 px-8 text-white hover:bg-violet-700"
          >
            See It In Action
            <ArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline" className="px-8">
            View Features
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 border-t border-border/40 pt-12">
          {[
            { value: "5 min", label: "From trend to full content plan" },
            { value: "$0", label: "AI & API cost — always free" },
            { value: "3 platforms", label: "Facebook, YouTube, LinkedIn" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-violet-400 sm:text-3xl">{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
