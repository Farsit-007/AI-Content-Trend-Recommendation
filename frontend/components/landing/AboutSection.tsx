const values = [
  {
    icon: "🎯",
    title: "Signal over noise",
    description:
      "We believe marketing teams shouldn't drown in 200+ daily headlines. Growth Studio exists to surface the handful of trends that actually matter for your audience.",
  },
  {
    icon: "🤝",
    title: "Built for real teams",
    description:
      "Every feature comes from a real edtech content workflow — not a spec sheet. If it doesn't save a marketer time, it doesn't ship.",
  },
  {
    icon: "⚡",
    title: "Fast, honest AI",
    description:
      "We use AI where it earns its keep and zero-cost heuristics everywhere else, so the product stays fast, affordable, and grounded in your real data.",
  },
]

const stats = [
  { value: "5+", label: "Trend sources monitored" },
  { value: "3", label: "Platforms analyzed" },
  { value: "5", label: "Content formats per idea" },
  { value: "3h", label: "Refresh cadence" },
]

const teamMembers = [
  { name: "Mehedi Imun", role: "Founder & Full-Stack", avatar: "", initials: "MI" },
  { name: "Ravi Samin", role: "AI & Product", avatar: "", initials: "RS" },
  { name: "Aisha Rahman", role: "Design & Brand", avatar: "", initials: "AR" },
  { name: "Tanvir Ahmed", role: "Data & Analytics", avatar: "", initials: "TA" },
]

export default function AboutSection() {
  return (
    <section id="about" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            About Us
          </span>
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Why we built Growth Studio</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            We&apos;re a small team of builders and marketers who watched content teams spend hours
            hunting for what to post next. So we built the tool we wished we had — one dashboard that
            bridges what&apos;s trending in tech with what actually works on your channels.
          </p>
        </div>

        {/* Stats strip */}
        <div className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/40 bg-card p-6 text-center"
            >
              <div className="mb-1 text-3xl font-extrabold text-violet-400">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Mission / values */}
        <div className="mb-16 grid gap-6 md:grid-cols-3">
          {values.map((value) => (
            <div
              key={value.title}
              className="rounded-xl border border-border/40 bg-card p-6 transition-all hover:border-violet-500/30"
            >
              <span className="mb-4 inline-block text-2xl">{value.icon}</span>
              <h3 className="mb-2 text-lg font-semibold text-foreground">{value.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{value.description}</p>
            </div>
          ))}
        </div>

        {/* Team */}
        <div className="mb-10 text-center">
          <h3 className="text-2xl font-bold sm:text-3xl">The team</h3>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            The people bridging trends and content, one dashboard at a time.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {teamMembers.map((member) => (
            <div
              key={member.name}
              className="flex flex-col items-center rounded-xl border border-border/40 bg-card p-6 text-center transition-all hover:border-violet-500/30"
            >
              {member.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="mb-4 size-16 rounded-full object-cover"
                />
              ) : (
                <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-lg font-bold text-violet-300">
                  {member.initials}
                </div>
              )}
              <h4 className="font-semibold text-foreground">{member.name}</h4>
              <p className="text-sm text-muted-foreground">{member.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
