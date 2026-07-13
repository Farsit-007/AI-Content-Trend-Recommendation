"use client"

import { motion } from "framer-motion"
import { Newspaper, Filter, Mic, PenTool, BarChart2, MessageSquare, Flame, Target } from "lucide-react"

type BentoFeature = {
  icon: React.ElementType
  title: string
  description: string
  badge?: string
  colSpan?: string
  accent?: boolean
  metrics?: string[]
}

const features: BentoFeature[] = [
  {
    icon: Newspaper,
    title: "News Feed Dashboard",
    description:
      "Card-based feed — dark theme, tab filtering by AI / Web Dev / Career / Security, sorted by latest, relevance, or trend score.",
    badge: "Live",
    colSpan: "md:col-span-2",
  },
  {
    icon: Filter,
    title: "4-Layer AI Filter",
    description:
      "Reduces 200+ daily items to the 20–30 that matter. Keyword → vector dedup → Redis cache → relevance gate.",
    badge: "Technical",
    colSpan: "md:col-span-1",
  },
  {
    icon: Mic,
    title: "Brand Voice RAG",
    description:
      "Generates content that sounds like YOUR brand using vector search on your real high-engagement posts.",
    colSpan: "md:col-span-1",
  },
  {
    icon: PenTool,
    title: "Multi-Format Content Generator",
    description:
      "One trending topic → Facebook post, Reel script, LinkedIn post, full YouTube idea + chapters — all in one click.",
    badge: "AI-Powered",
    colSpan: "md:col-span-2",
  },
  {
    icon: BarChart2,
    title: "Cross-Platform Analytics",
    description:
      "30-day unified report across Facebook, YouTube, and LinkedIn — reach, engagement, best times, top content, and AI insight in Banglish.",
    colSpan: "md:col-span-3",
    accent: true,
    metrics: ["30-day history", "3 platforms", "AI insights"],
  },
  {
    icon: MessageSquare,
    title: "Ask Growth Studio",
    description:
      "Ask in Banglish/English. Get data-grounded answers from your news database and analytics via RAG.",
    badge: "AI",
    colSpan: "md:col-span-1",
  },
  {
    icon: Flame,
    title: "Trend Score",
    description:
      "Zero-AI trending score from engagement signals — points, comments, recency decay. 🔥 when score ≥ 7.",
    colSpan: "md:col-span-1",
  },
  {
    icon: Target,
    title: "Opportunity Scoring",
    description:
      "Cross-references trends with your historical engagement. Shows which trends work for YOUR audience, ranked.",
    colSpan: "md:col-span-1",
  },
]

const badgeStyles: Record<string, string> = {
  Live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Technical: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "AI-Powered": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  AI: "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

const itemVariant = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

export default function FeaturesSection() {
  return (
    <section id="features" className="py-10 md:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          viewport={{ once: true }}
          className="mb-8 text-center"
        >
          <span className="mb-3 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-indigo-300">
            Features
          </span>
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A complete marketing intelligence platform for edtech content teams who need to move
            fast without compromising on quality.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariant}
              className={`glass-card group rounded-xl p-5 transition-colors duration-300 hover:border-violet-500/30 ${feature.colSpan ?? ""} ${feature.accent ? "border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-cyan-500/5" : ""}`}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className={`inline-flex rounded-lg p-2 ${feature.accent ? "border border-violet-500/30 bg-violet-500/10" : "border border-white/10 bg-white/5"}`}>
                  <feature.icon className={`size-4 ${feature.accent ? "text-violet-400" : "text-muted-foreground group-hover:text-violet-400 transition-colors"}`} />
                </div>
                {feature.badge && (
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeStyles[feature.badge] ?? ""}`}>
                    {feature.badge}
                  </span>
                )}
              </div>
              <h3 className="mb-1.5 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              {feature.metrics && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {feature.metrics.map((m) => (
                    <span key={m} className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-xs text-violet-300">
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
