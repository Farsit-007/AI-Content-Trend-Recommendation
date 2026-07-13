"use client"

import { motion } from "framer-motion"
import { Radio, BarChart3, GitMerge, Sparkles } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: Radio,
    title: "Monitor",
    description: "Pulls tech news from 5+ sources every 3 hours. 4-layer filter reduces 200+ items to the 20–30 that matter.",
  },
  {
    number: "02",
    icon: BarChart3,
    title: "Analyze",
    description: "Your Facebook, YouTube, and LinkedIn analytics refresh every 6 hours — top content, best times, engagement patterns.",
  },
  {
    number: "03",
    icon: GitMerge,
    title: "Cross-Reference",
    description: "Vector search connects trends to your historical data. Opportunities ranked by trend × audience match score.",
  },
  {
    number: "04",
    icon: Sparkles,
    title: "Generate",
    description: "Click any card → 5 content formats in under 10 seconds: Facebook, Reel script, LinkedIn, YouTube idea, caption.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-10 md:py-14 bg-white/[0.04]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          viewport={{ once: true }}
          className="mb-8 text-center"
        >
          <span className="mb-3 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-emerald-400">
            How It Works
          </span>
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
            From trend to content in{" "}
            <span className="gradient-text">5 minutes</span>
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Runs automatically in the background. When you open the dashboard, everything is already done.
          </p>
        </motion.div>

        {/* Desktop stepper */}
        <div className="hidden lg:block">
          <div className="relative">
            <div className="absolute top-[1.75rem] left-[calc(12.5%+2rem)] right-[calc(12.5%+2rem)] h-px bg-gradient-to-r from-violet-500/40 via-cyan-500/40 to-violet-500/40" />
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
              className="grid grid-cols-4 gap-4"
            >
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
                  }}
                  className="relative flex flex-col items-center text-center"
                >
                  <div className="relative mb-5 flex size-14 items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/10 ring-4 ring-background">
                    <step.icon className="size-5 text-violet-400" />
                    <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mb-1.5 font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Mobile stack */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{ visible: { transition: { staggerChildren: 0.09 } } }}
          className="space-y-3 lg:hidden"
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              variants={{
                hidden: { opacity: 0, x: -14 },
                visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
              }}
              className="glass-card flex gap-4 rounded-xl p-4"
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <div className="flex size-10 items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/10">
                  <step.icon className="size-4 text-violet-400" />
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-1 h-full w-px bg-gradient-to-b from-violet-500/40 to-transparent" />
                )}
              </div>
              <div className="pb-2">
                <div className="mb-0.5 text-xs font-bold text-violet-500/60">{step.number}</div>
                <h3 className="mb-1 font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
