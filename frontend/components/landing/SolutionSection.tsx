const capabilities = [
  {
    number: "01",
    icon: "📡",
    title: "Monitors",
    description:
      "Pulls tech news from HackerNews, Dev.to, GitHub, Reddit, and RSS feeds every 3 hours — automatically, around the clock.",
  },
  {
    number: "02",
    icon: "📊",
    title: "Analyzes",
    description:
      "Fetches 30 days of your Facebook page, YouTube channel, and LinkedIn performance data — reach, views, engagement, best times, top content.",
  },
  {
    number: "03",
    icon: "🔀",
    title: "Cross-References",
    description:
      "Combines trending topics with your audience data to surface the highest-opportunity content ideas ranked by what will work for YOUR specific followers.",
  },
  {
    number: "04",
    icon: "✍️",
    title: "Generates",
    description:
      "Creates platform-specific content in one click: Facebook post, Reel script, LinkedIn post, full YouTube idea, and short captions — all in Banglish, in your brand voice.",
  },
]

export default function SolutionSection() {
  return (
    <section id="solution" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            The Solution
          </span>
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Meet Growth Studio</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            The only tool that combines what&apos;s trending in tech with what works on YOUR
            channels — and turns it into a full week of content in 5 minutes.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {capabilities.map((cap) => (
            <div
              key={cap.number}
              className="group rounded-xl border border-border/40 bg-card p-6 transition-all hover:border-violet-500/30 hover:bg-card"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="text-2xl font-extrabold text-violet-500/30">{cap.number}</span>
                <span className="text-2xl">{cap.icon}</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">{cap.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{cap.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 text-center">
          <p className="text-lg font-medium text-foreground">
            &ldquo;The marketing team opens one dashboard. They see what&apos;s trending, what&apos;s
            working on their channels, and what to create next.{" "}
            <span className="text-violet-400">Everything generated. Nothing left to guess.</span>
            &rdquo;
          </p>
        </div>
      </div>
    </section>
  )
}
