const steps = [
  {
    number: "01",
    icon: "📡",
    title: "Monitor",
    description:
      "Growth Studio continuously pulls tech news from 5+ sources every 3 hours. A 4-layer filter pipeline reduces 200+ items to the 20–30 that actually matter for your audience.",
  },
  {
    number: "02",
    icon: "📊",
    title: "Analyze",
    description:
      "Every 6 hours, your Facebook page, YouTube channel, and LinkedIn analytics are refreshed — revealing your top content, best posting times, and what your audience actually engages with.",
  },
  {
    number: "03",
    icon: "🔀",
    title: "Cross-Reference",
    description:
      "Vector search connects trending topics to your historical performance data. Content opportunities are ranked by opportunity score: trend × audience match.",
  },
  {
    number: "04",
    icon: "🚀",
    title: "Generate",
    description:
      "Click any news card → get 5 content formats in under 10 seconds: Facebook post, Reel script, LinkedIn post, full YouTube idea, and a short caption — all in Banglish, in your brand voice.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            How It Works
          </span>
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">From trend to content in 5 minutes</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Growth Studio runs automatically in the background. When you open the dashboard, everything
            is already done.
          </p>
        </div>

        {/* Desktop: horizontal stepper */}
        <div className="hidden lg:block">
          <div className="relative">
            <div className="absolute top-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="grid grid-cols-4 gap-6">
              {steps.map((step, i) => (
                <div key={step.number} className="relative flex flex-col items-center text-center">
                  <div className="relative mb-6 flex size-16 items-center justify-center rounded-full border border-violet-500/30 bg-card text-2xl shadow-lg shadow-violet-500/10">
                    {step.icon}
                    <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mb-2 font-semibold text-foreground">{step.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: vertical stack */}
        <div className="space-y-6 lg:hidden">
          {steps.map((step, i) => (
            <div key={step.number} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-card text-xl">
                  {step.icon}
                </div>
                {i < steps.length - 1 && <div className="mt-2 h-full w-px bg-border/40" />}
              </div>
              <div className="pb-6">
                <div className="mb-1 text-xs font-bold text-violet-500">{step.number}</div>
                <h3 className="mb-1 font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
