"use client"

import { motion } from "framer-motion"
import { EyeOff, Users, Zap, GitMerge } from "lucide-react"

const problems = [
  {
    icon: EyeOff,
    title: "No visibility into what's trending",
    description:
      "Manually browsing HackerNews, Dev.to, and Twitter every day — hours wasted, still missing things. Competitors post trending content first.",
  },
  {
    icon: Users,
    title: "No understanding of your own audience",
    description:
      "Don't know which posts performed well, which topics resonate, or the best time to post. No single dashboard shows Facebook + YouTube + LinkedIn together.",
  },
  {
    icon: Zap,
    title: "Content creation is slow and inconsistent",
    description:
      "A good Banglish Facebook post takes an hour. A YouTube script takes half a day. Can't keep up across all platforms consistently.",
  },
  {
    icon: GitMerge,
    title: "No connection between trends and your data",
    description:
      "Even when a trending topic is found, there's no way to know if YOUR audience cares about it. Generic trending ≠ what your followers engage with.",
  },
]

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
}

export default function ProblemSection() {
  return (
    <section id="problem" className="py-10 md:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          viewport={{ once: true }}
          className="mb-8 text-center"
        >
          <span className="mb-3 inline-block rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-red-400">
            The Problem
          </span>
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Sound familiar?</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            The Programming Hero marketing team faces these problems every single day — and most
            content teams do too.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {problems.map((p) => (
            <motion.div
              key={p.title}
              variants={item}
              className="glass-card group rounded-xl p-6 transition-colors duration-300 hover:border-red-500/20"
            >
              <div className="mb-4 inline-flex rounded-lg border border-red-500/20 bg-red-500/10 p-2.5">
                <p.icon className="size-5 text-red-400" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.25 }}
          viewport={{ once: true }}
          className="mt-4 glass-card rounded-xl p-5 text-center"
        >
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">The cost:</span> Trending topics
            missed → competitors post first. Wrong content → low engagement. Inconsistent posting →
            algorithmic penalty.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
