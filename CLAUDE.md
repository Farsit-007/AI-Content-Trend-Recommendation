# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project structure

This is a hackathon monorepo — Growth Studio, an AI Content & Trend Intelligence Platform:

- `backend/` — server-side code (Node.js + TypeScript)
- `frontend/` — Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui

## Frontend stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Animations:** Framer Motion
- **Icons:** lucide-react
- **Toasts:** Sonner
- **Dark mode:** next-themes (class-based, defaults to dark)

## Setup and commands

```bash
# Install dependencies
cd frontend && npm install

# Start dev server (http://localhost:3000)
cd frontend && npm run dev

# Production build
cd frontend && npm run build

# Type check
cd frontend && npm run typecheck

# Lint
cd frontend && npm run lint
```

## Frontend file conventions

```
frontend/
├── app/
│   ├── layout.tsx              # root layout
│   ├── page.tsx                # landing page
│   └── (dashboard)/            # route group — adds sidebar layout, no URL segment
│       ├── layout.tsx          # sidebar layout (shadcn Sidebar)
│       └── dashboard/          # URL prefix: /dashboard/*
│           ├── page.tsx        # redirects → /dashboard/feed
│           ├── feed/page.tsx   # /dashboard/feed — news feed
│           ├── generate/page.tsx  # /dashboard/generate — content generator
│           ├── report/page.tsx    # /dashboard/report — analytics report
│           ├── chat/page.tsx      # /dashboard/chat — Ask Growth Studio
│           └── admin/page.tsx     # /dashboard/admin — admin triggers
├── components/
│   ├── landing/                # landing page sections (already built)
│   ├── ui/                     # shadcn components — never modify directly
│   ├── feed/                   # news feed components
│   ├── generate/               # content generator components
│   ├── report/                 # report + chart components
│   ├── chat/                   # chat UI components
│   └── shared/                 # shared layout components
├── lib/
│   ├── utils.ts                # cn() helper
│   └── mock/                   # mock data (keep until after demo)
│       ├── news.ts
│       ├── report.ts
│       ├── content.ts
│       └── chat.ts
```

## Installed shadcn/ui components

All live in `frontend/components/ui/` — **never modify these files, only import from them**.

```tsx
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Toaster } from "@/components/ui/sonner"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
```

To add a new component: `npx shadcn@latest add <name>` from `frontend/`.

## Design tokens (globals.css utilities)

- `.gradient-text` — violet→cyan gradient text
- `.glass-card` — `bg-white/5 backdrop-blur-sm border border-white/10`
- `.btn-glow` — violet glow shadow
- Primary accent: `violet-400 / violet-600`
- Trending/hot: `amber-400`
- Opportunity: `emerald-400`
- Muted: `text-muted-foreground`

## Rules

- Use `cn()` from `@/lib/utils` for all conditional class merging
- `"use client"` only when needed (event handlers, useState, useEffect)
- All pages must be responsive — mobile-first, 375px minimum
- Dark mode is default — always test in dark mode
- Use `lucide-react` for all icons
- Mock data stays in `frontend/lib/mock/` — do NOT delete until after demo day
