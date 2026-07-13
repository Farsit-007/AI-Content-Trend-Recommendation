import { TrendingUp } from "lucide-react"

const techStack = [
  "Next.js 16",
  "MongoDB Atlas",
  "OpenRouter",
  "Redis",
  "Meta Graph API",
  "YouTube Data API",
  "LinkedIn API",
]

export default function Footer() {
  return (
    <footer className="border-t border-border/40 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-violet-500" />
            <span className="font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Growth Studio
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground sm:justify-end">
            <a href="#problem" className="hover:text-foreground">Problem</a>
            <a href="#solution" className="hover:text-foreground">Solution</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how-it-works" className="hover:text-foreground">How It Works</a>
          </nav>
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-border/40 bg-card px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          <p className="font-medium text-foreground/60">
            Growth Studio &middot; Team Next Wave &middot; AI Content &amp; Trend Recommendation
          </p>
          <p className="mt-1">Hackathon Project &middot; Jul 12–18, 2026</p>
        </div>
      </div>
    </footer>
  )
}
