# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project structure

This is a hackathon monorepo — Growth Studio, an AI Content & Trend Intelligence Platform:

- `backend/` — server-side code (Node.js + TypeScript)
- `frontend/` — Vite + React 19 + TypeScript + Tailwind CSS v4

## Frontend stack

- **Framework:** Vite + React 19
- **Language:** TypeScript
- **Routing:** React Router v7
- **Styling:** Tailwind CSS v4
- **Animations:** Framer Motion
- **Icons:** lucide-react
- **Toasts:** Sonner
- **Dark mode:** class-based (defaults to dark, toggle via `document.documentElement.classList`)

## Setup and commands

```bash
# Install dependencies
cd frontend && npm install

# Start dev server (http://localhost:5173)
cd frontend && npm run dev

# Production build
cd frontend && npm run build

# Type check
cd frontend && npm run build  # tsc -b is part of build

# Lint
cd frontend && npm run lint
```

## Frontend file conventions

Routing is **data-driven**, not file-per-page-registered-by-hand: each role has a `TUserPath[]`
array (`name`/`path`/`element`/`icon`/`roles`) that `routeGenerator()` turns into React Router
routes and `sidebarItemsGenerator()` turns into the sidebar — adding a page is one array entry,
not a manual route registration.

```
frontend/
├── public/                       # static assets served at /
├── src/
│   ├── main.tsx                  # entry point — mounts <App />, QueryClientProvider
│   ├── App.tsx                   # root component — router setup, providers
│   ├── index.css                 # global styles + Tailwind base + design tokens
│   ├── pages/                    # one file per route
│   │   ├── Landing.tsx           # / — landing page
│   │   ├── Login.tsx             # /login
│   │   ├── About.tsx             # /about
│   │   └── dashboard/
│   │       ├── Overview.tsx      # /dashboard — index route
│   │       ├── Feed.tsx          # /dashboard/feed — news feed
│   │       ├── Generate.tsx      # /dashboard/generate — content generator
│   │       ├── Drafts.tsx        # /dashboard/drafts — saved drafts, approve/dismiss
│   │       ├── Chat.tsx          # /dashboard/chat — Ask Growth Studio
│   │       ├── Admin.tsx         # /dashboard/admin — admin triggers (ingestion runs)
│   │       └── settings/
│   │           └── Team.tsx      # /dashboard/settings/team — voice, subscriptions, brand voice
│   ├── routes/
│   │   ├── user.routes.tsx        # TUserPath[] for role 'user'
│   │   ├── admin.routes.tsx       # TUserPath[] for role 'admin'
│   │   ├── supperAdmin.routes.tsx # TUserPath[] for role 'super_admin'
│   │   ├── routes.tsx             # top-level RouterProvider tree
│   │   └── index.ts               # getDashboardPaths(role) — picks the array above
│   ├── utils/
│   │   ├── routesGenerator.ts        # TUserPath[] -> RouteObject[]
│   │   └── sidebarItemsGenerator.tsx # TUserPath[] -> sidebar entries
│   ├── components/
│   │   ├── landing/              # landing page sections
│   │   ├── feed/                 # news feed components (NewsCard, FeedControls, …)
│   │   ├── generate/             # content generator components
│   │   ├── team/                 # team settings sections (voice, subscriptions, brand voice, style pack)
│   │   ├── layout/               # MainLayout, ProtectedRoute, Sidebar
│   │   ├── shared/               # Navbar, PublicNavbar, PublicLayout, ThemeToggle
│   │   └── ui/                   # shadcn-style primitives (button, card, sheet, …)
│   ├── context/                  # AuthContext, ThemeProvider, TeamProvider (+ *-context.ts hook files)
│   ├── hooks/                    # small reusable hooks (use-mobile, useDebouncedValue, …)
│   ├── types/                    # shared TS types (sidebar.type.ts, global.ts, index.ts)
│   └── lib/
│       ├── utils.ts              # cn() helper
│       ├── constants.ts          # shared constants (news taxonomy, sort options, …)
│       ├── useTeamId.ts          # resolves the active team for the dashboard (via TeamProvider)
│       ├── queryClient.ts        # shared @tanstack/react-query client
│       ├── api/                  # one thin file per backend domain (news.ts, content.ts, teams.ts, …)
│       └── mock/                 # only landing.ts today (landing-page copy) — not a general
│                                  # mock-data layer; dashboard pages hit the real API
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

## Environment variables

Vite exposes env vars prefixed with `VITE_` (not `NEXT_PUBLIC_`):

```bash
VITE_API_URL=http://localhost:5000/api/v1
VITE_USE_MOCK=false
VITE_DEFAULT_TEAM_ID=
```

Access in code: `import.meta.env.VITE_API_URL`

## Design tokens (index.css utilities)

- `.gradient-text` — violet→cyan gradient text
- `.glass-card` — `bg-white/5 backdrop-blur-sm border border-white/10`
- `.btn-glow` — violet glow shadow
- Primary accent: `violet-400 / violet-600`
- Trending/hot: `amber-400`
- Opportunity: `emerald-400`
- Muted: `text-muted-foreground`

## Rules

- Use `cn()` from `@/lib/utils` for all conditional class merging
- No `"use client"` — all components are client components in React/Vite
- All pages must be responsive — mobile-first, 375px minimum
- Dark mode is default — always test in dark mode
- Use `lucide-react` for all icons
- Mock data stays in `src/lib/mock/` — do NOT delete until after demo day
- Path alias `@/` maps to `src/` — configure in `vite.config.ts` + `tsconfig.app.json`
