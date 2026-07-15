## Why

The current landing page (`src/pages/Landing.tsx`) is a single static hero — one screen, no scroll narrative, and it never shows the actual product. For a marketing/content-intelligence platform, the landing page *is* the pitch: it needs to hook, prove the product is real, explain how it works, build trust, and convert. We're heading into a hackathon demo where first impressions decide everything, so we need a world-class, dynamic-yet-clean landing experience that showcases Growth Studio's real capabilities.

## What Changes

- Replace the single-section hero with a **scroll-driven marketing page** composed of discrete, animated sections.
- Add shared visual primitives:
  - `AuroraBackground` — animated violet→cyan gradient mesh (slow drift).
  - `GridPattern` — subtle crafted grid/dot background, radial-masked to fade toward edges (Linear/Vercel look).
  - `Section` — consistent padding + heading rhythm wrapper.
- Add landing sections under `src/components/landing/`:
  - **Hero** — aurora + grid background, gradient headline, dual CTA, live product mockup.
  - **LogoCloud** — social-proof strip (logos / metric pills).
  - **FeatureShowcase** — alternating rows for the four real capabilities (Trend Feed, Content Generation, Analytics, Ask/Chat) each with a mini mockup and its semantic accent.
  - **HowItWorks** — 3-step funnel (Track → Generate → Measure).
  - **BentoGrid** ("Why Growth Studio") — a realistic proof grid: concrete outcome metrics, an integrations row, and an attributed customer quote (not vague filler).
  - **Testimonials** — quote cards (marquee or 3-up).
  - **CtaSection** — full-width glass conversion panel with `btn-glow`.
  - **Footer** — product links, About, socials, copyright.
- **Theme-aware (light + dark):** all sections render correctly in both light and dark using shadcn/Tailwind semantic tokens (`bg-background`/`bg-card`/`bg-muted`, `text-foreground`/`text-muted-foreground`, `border-border`) instead of hardcoded white/black. Dark remains the default; `glass-card` becomes theme-aware.
- **Distinct section backgrounds:** each section gets a differentiated background treatment (alternating surface tints + subtle per-section pattern accents) so sections read as separate bands. The Hero is approved as-is and stays unchanged.
- **Realistic, data-driven content:** all mock content (trend feed, chart series, stats, logos, testimonials, bento proof) is internally consistent and pulled from a single shared mock module — no placeholder lorem or contradictory numbers.
- **Icons only, no emoji:** every glyph/indicator uses `lucide-react` icons; no emoji or unicode symbols (↑, •, etc.) in UI copy.
- Compose all sections in `Landing.tsx`; keep it responsive (mobile-first, 375px min).
- All motion respects `prefers-reduced-motion`.
- No backend or routing changes; reuses design tokens (`glass-card`, `gradient-text`, `btn-glow`) and stack (Framer Motion, lucide-react, Tailwind v4).

## Capabilities

### New Capabilities
- `marketing-landing-page`: The public, unauthenticated landing experience — its required sections, content, responsive behavior, motion/accessibility rules, and reuse of existing design tokens.

### Modified Capabilities
<!-- None — no existing spec-level behavior changes. -->

## Impact

- **Code (new):** `src/components/landing/` — `AuroraBackground`, `GridPattern`, `Section`, `Hero`, `LogoCloud`, `FeatureShowcase`, `HowItWorks`, `BentoGrid`, `Testimonials`, `CtaSection`, `Footer`; plus `src/lib/mock/landing.ts` (single shared source for landing mock data).
- **Code (modified):** `src/pages/Landing.tsx`; `src/index.css` (`grid-pattern` utility + theme-aware `glass-card` that works in light and dark); all landing components audited to replace hardcoded white/black with semantic theme tokens and swap any emoji/unicode glyphs for lucide icons. **Hero is unchanged** (approved).
- **Dependencies:** none new — Framer Motion, lucide-react, Tailwind v4 already installed.
- **Routing/auth/APIs:** unchanged; CTAs continue to point at `/login` and `/dashboard`.
- **Assets:** realistic but fictional logos/avatars/quotes for social proof and testimonials (static, internally consistent, no real customer data).
