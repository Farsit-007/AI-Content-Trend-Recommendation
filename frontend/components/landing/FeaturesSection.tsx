const features = [
  {
    icon: "📰",
    title: "News Feed Dashboard",
    description:
      "Card-based feed styled like daily.dev — dark theme, tab filtering by AI / Web Dev / Career / Security, sorted by latest, relevance, or trend score.",
    badge: "Core",
  },
  {
    icon: "🔬",
    title: "4-Layer AI Filter Pipeline",
    description:
      "Reduces 200+ daily news items to the 20–30 that matter. Keyword pre-filter → vector dedup → Redis cache → relevance gate. Zero AI cost as volume scales.",
    badge: "Technical",
  },
  {
    icon: "✨",
    title: "Multi-Format Content Generator",
    description:
      "One trending topic → Facebook post, Reel script, LinkedIn post, full YouTube idea (title + hook + chapters + thumbnail), and short caption — all in one click.",
    badge: "Core",
  },
  {
    icon: "🎙️",
    title: "Brand Voice RAG",
    description:
      "Generates content that sounds like YOUR brand, not generic AI. Uses vector search on your real high-engagement posts as few-shot examples.",
    badge: "AI",
  },
  {
    icon: "📈",
    title: "Cross-Platform Analytics",
    description:
      "30-day unified report across Facebook, YouTube, and LinkedIn — reach, engagement, best times, top content, and AI cross-platform insight in Banglish.",
    badge: "Analytics",
  },
  {
    icon: "💬",
    title: "Ask Growth Studio Chat",
    description:
      'Ask questions in plain Banglish/English. Get data-grounded answers from your real news database and platform analytics in seconds via RAG.',
    badge: "AI",
  },
  {
    icon: "🔥",
    title: "Trend Score",
    description:
      "Zero-AI trending potential score calculated from engagement signals — points, comments, and recency decay. 🔥 badge when score ≥ 7.",
    badge: "Smart",
  },
  {
    icon: "🎯",
    title: "Opportunity Scoring",
    description:
      "Cross-references trending topics with your historical engagement data. Shows which trends will work for YOUR specific audience, ranked by opportunity score.",
    badge: "Smart",
  },
  {
    icon: "⚡",
    title: "Impact Simulator",
    description:
      "Per high-relevance news item, AI generates one concrete content suggestion personalized to your channel's performance patterns.",
    badge: "AI",
  },
]

const badgeColors: Record<string, string> = {
  Core: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Technical: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  AI: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  Analytics: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Smart: "bg-amber-500/10 text-amber-400 border-amber-500/20",
}

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            Features
          </span>
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Everything you need</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A complete marketing intelligence platform built for edtech content teams who need to
            move fast without compromising on quality.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-violet-500/20 hover:shadow-lg hover:shadow-violet-500/5"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="text-2xl">{feature.icon}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badgeColors[feature.badge]}`}
                >
                  {feature.badge}
                </span>
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
