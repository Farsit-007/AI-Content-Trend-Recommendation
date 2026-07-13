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

const navLinks = [
  { label: "Problem", href: "#problem" },
  { label: "Solution", href: "#solution" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
]

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-violet-400" />
            <span className="font-bold gradient-text">Growth Studio</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground sm:justify-end">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          <p className="font-medium text-foreground/60">
            Growth Studio &middot; Team Next Wave &middot; AI Content &amp; Trend Intelligence
          </p>
          <p className="mt-1">Hackathon Project &middot; Jul 12–18, 2026</p>
        </div>
      </div>
    </footer>
  )
}
