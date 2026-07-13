## Context

Growth Studio is a hackathon AI platform (Jul 12–18, 2026) for the Programming Hero team. The landing page is the product's public face — it must convert skeptical judges and busy marketers in under 10 seconds. The stack is Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (radix-nova), lucide-react, and Framer Motion. The `frontend/` directory is a running Next.js app; the landing page is built inside it as `app/page.tsx`.

## Goals / Non-Goals

**Goals:**
- Build a premium dark landing page inside the existing Next.js 16 App Router project
- Establish a senior-level design system: gradient accent palette, glassmorphism cards, bento grid features section
- Scroll-triggered animations with Framer Motion that feel native, not gimmicky
- Fully responsive: mobile-first, desktop-polished, zero horizontal scroll at any breakpoint
- Components scoped to `frontend/components/landing/` per project conventions

**Non-Goals:**
- No backend API calls on the landing page (purely static)
- No authentication or user account flows
- No client-side routing beyond anchor-link scroll navigation
- No additional npm packages beyond what is already installed

## Decisions

### Next.js 16 App Router, not a separate Vite app
The project already runs Next.js 16. The landing page is `app/page.tsx` — one file in the existing app. A second Vite dev server would add orchestration complexity and break the Docker compose setup for zero benefit on a single static page.

### shadcn/ui as the component foundation
shadcn/ui (radix-nova) provides pre-built, accessible primitives (Button, Card, Badge) that we style rather than build from scratch. This cuts ~40% of layout work and ensures consistent focus states, ARIA compliance, and design token alignment with the rest of the app.

### Framer Motion for scroll animations
`motion.div` with `whileInView` gives viewport-triggered animations with zero boilerplate. Every section fades and slides in as the user scrolls — a hallmark of premium SaaS landing pages. `viewport={{ once: true }}` prevents re-triggering and avoids jank. Children stagger with 0.1s delay between items.

### Bento grid over a uniform card grid for features
A bento grid (variable-size cells via CSS grid `col-span` and `row-span`) for the features section creates visual rhythm and signals design maturity. Primary features occupy large cells; supporting capabilities fill smaller ones. This breaks the monotony of a uniform 3-column grid and is immediately recognizable as a senior design choice.

### Glassmorphism card treatment
Cards use `bg-white/5 backdrop-blur-sm border border-white/10` with a `hover:border-violet-500/30 transition-colors` on hover. This creates perceived depth on the dark background without heavy box-shadows — reads as polished and intentional, not overdesigned.

### Gradient accent palette: violet → cyan
Primary accent gradient: `from-violet-500 to-cyan-500`. Applied consistently to: hero headline text, CTA button glow, bento card accent borders, stat badge highlights, and section dividers. A single gradient identity makes the product feel premium and tech-forward without requiring custom brand assets.

### lucide-react for all icons
Already in project dependencies. Consistent stroke weight, fully tree-shaken. No mixing icon libraries — every icon across every section uses lucide-react.

### TypeScript (.tsx) throughout
All landing components are `.tsx`. No `.jsx` files. Consistent with the rest of the Next.js project and avoids type drift when wiring to real API data later.

## Visual Design System

### Color Tokens
| Role | Value |
|---|---|
| Page background | `hsl(var(--background))` (zinc-950 equivalent) |
| Card surface | `bg-white/5` |
| Card border | `border-white/10` default · `border-violet-500/30` on hover |
| Gradient text | `bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent` |
| Muted body text | `text-muted-foreground` |
| Accent glow | `shadow-[0_0_40px_rgba(139,92,246,0.3)]` |

### Typography Scale
| Element | Classes |
|---|---|
| Hero H1 | `text-5xl md:text-7xl font-bold tracking-tight leading-none` |
| Section H2 | `text-3xl md:text-4xl font-bold tracking-tight` |
| Section lead | `text-lg text-muted-foreground max-w-2xl` |
| Card title | `text-lg font-semibold` |
| Badge label | `text-xs font-medium uppercase tracking-widest` |

### Spacing System
- Section padding: `py-24 md:py-32`
- Container: `max-w-6xl mx-auto px-4 sm:px-6`
- Card internal: `p-6`
- Bento gap: `gap-4`

### Framer Motion Defaults
```ts
// Entry animation (apply to every section wrapper)
initial={{ opacity: 0, y: 20 }}
whileInView={{ opacity: 1, y: 0 }}
transition={{ duration: 0.5, ease: 'easeOut' }}
viewport={{ once: true }}

// Stagger container
variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
```

### Bento Grid Structure (Features section)
```
┌─────────────────┬──────────┐
│  Feature A      │ Feature B│  ← row 1: A is col-span-2, B is col-span-1
│  (col-span-2)   │          │
├────────┬────────┴──────────┤
│Feature │  Feature D        │  ← row 2: C is col-span-1, D is col-span-2
│  C     │  (col-span-2)     │
├────────┴───────────────────┤
│  Feature E (col-span-3)    │  ← row 3: full-width accent card
└────────────────────────────┘
```

## Risks / Trade-offs

- [Framer Motion bundle size] → Tree-shaken; only `motion` components are imported. Negligible impact on a marketing page.
- [Bento grid on mobile] → All bento cells collapse to `col-span-1` on mobile; grid becomes a 1-column stack. Verified readable at 375px.
- [backdrop-blur Safari support] → Supported in Safari 14+; graceful degradation (card remains readable without blur on older Safari).
- [Gradient text on Firefox] → `background-clip: text` is fully supported in Firefox 119+. No fallback needed.

## Open Questions

- Final copywriting for stat badges (e.g., "10k+ articles/day" — confirm with team)
- Decide whether the hero CTA "Get Started" scrolls to Features or links to `/dashboard`
