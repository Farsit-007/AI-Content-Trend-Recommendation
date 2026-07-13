"use client"

import { motion } from "framer-motion"
import { Rss, BarChart3, GitMerge, Sparkles } from "lucide-react"

const capabilities = [
  {
    icon: Rss,
    number: "01",
    title: "Monitors",
    description:
      "Pulls tech news from HackerNews, Dev.to, GitHub, Reddit, and RSS feeds every 3 hours — automatically, around the clock.",
  },
  {
    icon: BarChart3,
    number: "02",
    title: "Analyzes",
    description:
      "Fetches 30 days of your Facebook page, YouTube channel, and LinkedIn performance data — reach, views, engagement, best times.",
  },
  {
    icon: GitMerge,
    number: "03",
    title: "Cross-References",
    description:
      "Combines trending topics with your audience data to surface the highest-opportunity content ideas for YOUR specific followers.",
  },
  {
    icon: Sparkles,
    number: "04",
    title: "Generates",
    description:
      "Creates platform-specific content in one click: Facebook post, Reel script, LinkedIn post, full YouTube idea — in Banglish, in your brand voice.",
  },
]

const item = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
}

export default function SolutionSection() {
  return (
    <section id="solution" className="py-10 md:py-14 bg-white/[0.04]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            viewport={{ once: true }}
            className="flex flex-col justify-start"
          >
            <span className="mb-3 inline-block self-start rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-violet-300">
              The Solution
            </span>
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Meet <span className="gradient-text">Growth Studio</span>
            </h2>
            <p className="mb-6 text-muted-foreground">
              The only tool that combines what&apos;s trending in tech with what works on YOUR
              channels — and turns it into a full week of content in 5 minutes.
            </p>
            <blockquote className="rounded-xl border-l-2 border-violet-500 bg-violet-500/5 py-4 pl-5 pr-4">
              <p className="text-sm italic text-muted-foreground">
                &ldquo;One dashboard. See what&apos;s trending, what works on your channels, and
                what to create next.{" "}
                <span className="font-semibold text-violet-400 not-italic">
                  Everything generated. Nothing left to guess.
                </span>
                &rdquo;
              </p>
            </blockquote>
          </motion.div>

          {/* Right */}
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="flex flex-col gap-3"
          >
            {capabilities.map((cap) => (
              <motion.div
                key={cap.number}
                variants={item}
                className="glass-card group flex gap-4 rounded-xl p-4 transition-colors duration-300 hover:border-violet-500/30"
              >
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
                    <cap.icon className="size-4 text-violet-400" />
                  </div>
                  <span className="text-xs font-bold text-violet-500/40">{cap.number}</span>
                </div>
                <div>
                  <h3 className="mb-1 font-semibold text-foreground">{cap.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{cap.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
