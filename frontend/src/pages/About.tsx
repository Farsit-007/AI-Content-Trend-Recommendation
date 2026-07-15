export default function About() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        About <span className="gradient-text">Growth Studio</span>
      </h1>
      <p className="text-muted-foreground mt-6 text-lg">
        Growth Studio is an AI-powered content and trend intelligence platform.
        It helps teams spot emerging trends, generate on-brand content in
        seconds, and understand what actually drives growth.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <div className="glass-card rounded-lg p-5">
          <h2 className="font-semibold">Trend Feed</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            A live pulse of the topics moving in your space.
          </p>
        </div>
        <div className="glass-card rounded-lg p-5">
          <h2 className="font-semibold">Content Generation</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            On-brand drafts tailored to your team&apos;s voice.
          </p>
        </div>
        <div className="glass-card rounded-lg p-5">
          <h2 className="font-semibold">Analytics</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Reports and AI insights on what performs.
          </p>
        </div>
      </div>
    </section>
  );
}
