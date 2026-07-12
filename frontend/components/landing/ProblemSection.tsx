const problems = [
  {
    icon: "📉",
    title: "No visibility into what's trending",
    description:
      "Manually browsing HackerNews, Dev.to, and Twitter every day — hours wasted, still missing things. Competitors post trending content first.",
  },
  {
    icon: "🤷",
    title: "No understanding of your own audience",
    description:
      "Don't know which posts performed well, which topics resonate, or the best time to post. No single dashboard shows Facebook + YouTube + LinkedIn together.",
  },
  {
    icon: "🐌",
    title: "Content creation is slow and inconsistent",
    description:
      "A good Banglish Facebook post takes an hour. A YouTube script takes half a day. Can't keep up across all platforms consistently.",
  },
  {
    icon: "🔗",
    title: "No connection between trends and your data",
    description:
      "Even when a trending topic is found, there's no way to know if YOUR audience cares about it. Generic trending ≠ what your followers engage with.",
  },
]

export default function ProblemSection() {
  return (
    <section id="problem" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
            The Problem
          </span>
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Sound familiar?</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            The Programming Hero marketing team faces these problems every single day — and most
            content teams do too.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {problems.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-red-500/10 bg-card p-6 transition-colors hover:border-red-500/20"
            >
              <div className="mb-3 text-3xl">{p.icon}</div>
              <h3 className="mb-2 font-semibold text-foreground">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-border/40 bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">The cost:</span> Trending topics
            missed → competitors post first. Wrong content → low engagement. Inconsistent posting →
            algorithmic penalty. Hours on research → less time on strategy.
          </p>
        </div>
      </div>
    </section>
  )
}
