---
name: build-frontend
description: Build a Growth Studio frontend feature — Next.js 16, Tailwind v4, shadcn/ui, Framer Motion. Mock-data-first, then wire to real API.
argument-hint: "<change-name> — the OpenSpec change to implement (e.g. news-feed-dashboard)"
allowed-tools: Read, Write, Edit, Glob, Bash(npm:*), Bash(cd frontend*)
---

You are the frontend engineer for Growth Studio — an AI Content & Trend Intelligence Platform.

Change to implement: $ARGUMENTS

Read `openspec/changes/$ARGUMENTS/tasks.md` first. Implement every task in order, checking each off as you go.

---

## Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (radix-nova) |
| Animations | Framer Motion |
| Charts | Recharts |
| Icons | lucide-react |
| Toasts | Sonner |
| Dark mode | next-themes (class-based, default dark) |
| Font | Inter (body) + Plus Jakarta Sans (headings) |

---

## File Conventions

```
frontend/
├── app/
│   ├── layout.tsx              # root layout
│   ├── page.tsx                # landing page
│   └── (dashboard)/            # app shell with sidebar
│       ├── layout.tsx          # sidebar layout
│       ├── feed/page.tsx       # news feed dashboard
│       ├── generate/page.tsx   # content generator
│       ├── report/page.tsx     # analytics report
│       ├── chat/page.tsx       # Ask Growth Studio
│       └── admin/page.tsx      # admin triggers
├── components/
│   ├── landing/                # landing page sections (already built)
│   ├── ui/                     # shadcn components — never modify directly
│   ├── feed/                   # news feed components
│   ├── generate/               # content generator components
│   ├── report/                 # report + chart components
│   ├── chat/                   # chat UI components
│   └── shared/                 # sidebar, header, shared layout
├── lib/
│   ├── utils.ts                # cn() helper
│   ├── api.ts                  # fetch wrappers for real API
│   └── mock/                   # mock data (delete after api-wiring)
│       ├── news.ts
│       ├── report.ts
│       ├── content.ts
│       └── chat.ts
```

---

## Mock Data First (Days 1–2)

Build ALL screens with hardcoded mock data. Never block on backend being ready.

```ts
// frontend/lib/mock/news.ts
export const MOCK_NEWS_ITEMS = [
  {
    id: "1",
    title: "React 19 Released — Server Components Are Now Stable",
    source: "hackernews",
    published_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    category: "Web Dev",
    trend_score: 8.4,
    relevance_score: 9,
    impact_note: "React 19 content historically gets 3× your average engagement on YouTube.",
    opportunity_score: 92,
    is_hot: true,         // trend_score >= 7
    is_opportunity: true, // high opportunity for this channel
  },
  // add 8–10 realistic items
]
```

On Day 3 (api-wiring branch), replace with:
```ts
// frontend/lib/api.ts
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export async function getNewsFeed(params?: { category?: string; sort?: string }) {
  const res = await fetch(`${API}/api/news?${new URLSearchParams(params)}`)
  return res.json()
}
```

---

## Design System

### Colors (already in globals.css — use these class names)
- Background: `bg-background` (dark: near-black)
- Cards: `bg-card` or `.glass` for premium look
- Primary accent: `text-violet-400`, `bg-violet-600`, `border-violet-500/30`
- Hot/trending: `text-amber-400`, `border-amber-500/30`
- Success/opportunity: `text-emerald-400`
- Muted text: `text-muted-foreground`

### Glass card (add to globals.css if not present)
```css
.glass {
  background: oklch(0.205 0 0 / 60%);
  backdrop-filter: blur(12px);
  border: 1px solid oklch(1 0 0 / 8%);
}
```

### Typography
- Headings: `font-heading font-bold` (Plus Jakarta Sans)
- Body: `font-sans` (Inter)
- Metric numbers: `text-3xl font-bold tabular-nums`
- Muted labels: `text-xs text-muted-foreground`

---

## Animation Patterns (Framer Motion)

### Stagger card entrance
```tsx
import { motion } from "framer-motion"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const card = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

<motion.div variants={container} initial="hidden" animate="show">
  {items.map(item => (
    <motion.div key={item.id} variants={card}>
      <NewsCard item={item} />
    </motion.div>
  ))}
</motion.div>
```

### Card hover
```tsx
<motion.div
  whileHover={{ scale: 1.01 }}
  transition={{ type: "spring", stiffness: 400, damping: 30 }}
  className="rounded-xl border border-border/40 bg-card p-5 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5"
>
```

### Sliding tab indicator
```tsx
<div className="relative flex gap-1">
  {tabs.map(tab => (
    <button key={tab} onClick={() => setActive(tab)} className="relative px-4 py-2 text-sm">
      {active === tab && (
        <motion.div layoutId="tab-indicator" className="absolute inset-0 rounded-md bg-violet-500/20" />
      )}
      <span className="relative">{tab}</span>
    </button>
  ))}
</div>
```

### Copy button with checkmark
```tsx
const [copied, setCopied] = useState(false)

async function handleCopy(text: string) {
  await navigator.clipboard.writeText(text)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}

<button onClick={() => handleCopy(content)}>
  {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
</button>
```

---

## Per-Screen Patterns

### News Feed Dashboard
```tsx
// components/feed/NewsCard.tsx
// Shows: source + time + category badge + headline + trend score + opportunity badge + Generate button
// 🔥 badge: animated pulse when item.is_hot === true
// "High opportunity" badge: amber glow when item.is_opportunity === true
// Tab bar: All | AI | Web Dev | Career | Security — sliding indicator
// Sort: Latest | Most Relevant | Trending — dropdown
```

### Content Generator UI
```tsx
// Split layout: left = selected news card context, right = format tabs + content
// Tabs: FB Post | Reel Script | LinkedIn | YouTube Idea | Caption
// Generate button → loading spinner (disabled state) → content appears
// Each tab content: textarea (read-only) + copy button
// Platform colors: blue=FB, red=YT, indigo=LinkedIn, violet=caption
```

### Report UI
```tsx
// Top row: 4 metric cards (Total Reach, Engagements, Views, Avg Engagement Rate)
// Each card: big number + delta arrow + sparkline (Recharts Sparkline)
// Charts: FB = AreaChart (blue), YT = BarChart (red), LI = RadialBarChart (indigo)
// AI insight block: violet left-border callout box, Banglish text
// Opportunity ranking: numbered list cards with platform badges
```

### Chat UI
```tsx
// Full-height flex column: messages list (overflow-y-auto flex-1) + input row (sticky bottom)
// User bubble: right-aligned, violet background, rounded-bl-xl
// Growth Studio bubble: left-aligned, bg-card, small TB avatar left
// Typing indicator: 3 dots animated (CSS or Framer Motion)
// Auto-scroll to bottom on new message
```

### Admin Triggers UI
```tsx
// 2 cards side by side
// "Run Ingestion" button: green glow on hover, play icon
// "Refresh Analytics" button: blue glow on hover, refresh icon
// After click: spinner → "Running..." → "Done ✓ at HH:MM" (use Sonner toast too)
```

---

## Sidebar Layout (App Shell)

```tsx
// app/(dashboard)/layout.tsx
// Use shadcn Sidebar component
// Nav items:
// 📰 Feed         → /feed
// ✨ Generate     → /generate
// 📈 Report       → /report
// 💬 Chat         → /chat
// ⚙️  Admin        → /admin
// Active item: violet bg + left border indicator
```

---

## shadcn Components to Use

```tsx
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"        // loading states
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"   // chat messages
import { Toaster } from "@/components/ui/sonner"           // copy/trigger toasts
import { Sidebar, SidebarContent, SidebarMenu } from "@/components/ui/sidebar"
```

---

## Rules

- Never modify files in `frontend/components/ui/` — only import from them
- Never push to `main` directly — always PR → 1 approval → squash merge
- Always run `npm run typecheck && npm run lint` before opening a PR
- Mock data lives in `frontend/lib/mock/` — delete the whole folder after api-wiring
- Use `cn()` from `@/lib/utils` for conditional class merging — never string concatenation
- All pages must be responsive (mobile-first — 375px minimum)
- Dark mode is the default and primary — always test in dark mode
- Use `lucide-react` for all icons — no other icon libraries
- `use client` only when needed (event handlers, useState, useEffect) — prefer server components
