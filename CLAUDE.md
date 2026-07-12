# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project structure

This is a hackathon monorepo — TrendBridge, an AI Content & Trend Intelligence Platform:

- `backend/` — server-side code (currently empty)
- `frontend/` — Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui

## Frontend stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + shadcn/ui (radix-nova style)
- **Icons:** lucide-react
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

- Components: `frontend/components/<feature>/ComponentName.tsx`
- Landing page sections: `frontend/components/landing/`
- Pages: `frontend/app/<route>/page.tsx`
- Shared UI: `frontend/components/ui/` (shadcn/ui components)
- Utilities: `frontend/lib/utils.ts` (exports `cn()`)
