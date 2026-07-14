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

```
frontend/
├── public/                     # static assets served at /
├── src/
│   ├── main.tsx                # entry point — mounts <App />
│   ├── App.tsx                 # root component — router setup, providers
│   ├── index.css               # global styles + Tailwind base
│   ├── pages/                  # one file per route
│   │   ├── Landing.tsx         # / — landing page
│   │   ├── Login.tsx           # /login
│   │   └── dashboard/
│   │       ├── Layout.tsx      # /dashboard/* — sidebar shell
│   │       ├── Feed.tsx        # /dashboard/feed — news feed
│   │       ├── Generate.tsx    # /dashboard/generate — content generator
│   │       ├── Report.tsx      # /dashboard/report — analytics report
│   │       ├── Chat.tsx        # /dashboard/chat — Ask Growth Studio
│   │       └── Admin.tsx       # /dashboard/admin — admin triggers
│   ├── components/
│   │   ├── landing/            # landing page sections
│   │   ├── feed/               # news feed components
│   │   ├── generate/           # content generator components
│   │   ├── report/             # report + chart components
│   │   ├── chat/               # chat UI components
│   │   └── shared/             # shared layout components (Navbar, Sidebar, etc.)
│   └── lib/
│       ├── utils.ts            # cn() helper
│       ├── api/                # API client functions
│       └── mock/               # mock data (keep until after demo)
│           ├── news.ts
│           ├── report.ts
│           ├── content.ts
│           └── chat.ts
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
