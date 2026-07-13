"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles, Zap, Globe, BarChart2 } from "lucide-react"

const statBadges = [
  { icon: Globe, label: "50+ sources monitored" },
  { icon: Zap, label: "6 AI-powered features" },
  { icon: BarChart2, label: "Real-time trend tracking" },
]

const stats = [
  { value: "5 min", label: "Trend to full content plan" },
  { value: "$0", label: "AI & API cost" },
  { value: "3×", label: "Platforms in one dashboard" },
]

export default function Hero() {
  return (
    <section className="relative flex items-center justify-center overflow-hidden pt-16 pb-0">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-5%,rgba(124,58,237,0.18),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_35%_35%_at_80%_60%,rgba(6,182,212,0.07),transparent)]" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl px-4 pt-16 pb-0 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
            <Sparkles className="size-3.5" />
            AI Content &amp; Trend Intelligence Platform
          </div>

          {/* Headline */}
          <h1 className="mb-5 text-5xl font-extrabold tracking-tight leading-[1.08] sm:text-6xl lg:text-7xl">
            <span className="text-foreground">Growth</span>
            <span className="gradient-text"> Studio</span>
          </h1>

          {/* Sub-headline */}
          <p className="mx-auto mb-2 max-w-2xl text-xl text-muted-foreground sm:text-2xl">
            AI Content &amp; Trend Intelligence —{" "}
            <span className="font-semibold text-foreground">
              built for teams that can&apos;t afford to guess
            </span>
          </p>
          <p className="mx-auto mb-8 max-w-xl text-base text-muted-foreground">
            From trending topic to a full week of platform-specific content in 5 minutes.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="btn-glow gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 px-8 text-white hover:from-violet-500 hover:to-cyan-500 border-0"
            >
              See It In Action
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" className="px-8 border-white/15 hover:bg-white/5">
              View Features
            </Button>
          </div>

          {/* Stat badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {statBadges.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-muted-foreground"
              >
                <Icon className="size-3.5 text-violet-400" />
                {label}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Stats bar — flush at bottom */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10"
        >
          {stats.map((s) => (
            <div key={s.label} className="py-6 text-center">
              <div className="gradient-text text-2xl font-bold sm:text-3xl">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
