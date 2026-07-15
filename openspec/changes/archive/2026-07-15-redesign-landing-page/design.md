## Context

Growth Studio's current landing page is a single static hero in `src/pages/Landing.tsx`. The stack is Vite + React 19, React Router v7, Tailwind CSS v4, Framer Motion, lucide-react, and Sonner, with a dark-first theme and violet accent. Design tokens already exist in `src/index.css`: `gradient-text`, `glass-card`, and `btn-glow` (plus semantic accents amber/emerald/cyan documented in CLAUDE.md). This redesign is UI-only — no backend, routing, or auth changes — and is aimed at a hackathon demo where the landing page carries the pitch.

## Goals / Non-Goals

**Goals:**
- A scroll-driven, multi-section landing page that showcases the four real capabilities.
- A "crafted" modern aesthetic (Linear/Vercel-style) via a subtle grid/dot pattern + animated aurora gradient.
- **Theme-aware:** correct, comfortable rendering in both light and dark using shadcn/Tailwind semantic tokens; dark remains the default.
- **Distinct section backgrounds** so the page reads as separate bands rather than one flat surface.
- **Realistic, internally-consistent content** driven from a single shared mock module — the page should feel like a real product, not a wireframe.
- **Icons only, no emoji** — every indicator is a `lucide-react` icon.
- Reuse existing stack; add zero new runtime dependencies.
- Fully responsive (375px min) and accessible (`prefers-reduced-motion`).
- Section components isolated under `src/components/landing/` for easy iteration.

**Non-Goals:**
- No backend, API, or auth changes; CTAs reuse existing `/login` and `/dashboard` routes.
- No real customer data — mock content is fictional but realistic and consistent (not lorem, not contradictory).
- No new routing; this stays a single `/` page inside the existing `PublicLayout`.
- No CMS or content-management; copy is hardcoded for the demo.
- **Hero is out of scope for this revision** — it is approved as-is and must not be restyled.

## Decisions

**1. Compose small section components rather than one monolithic page.**
`Landing.tsx` becomes a thin composition root that renders section components from `src/components/landing/`. This matches the CLAUDE.md convention (`components/landing/`), keeps each section independently editable, and avoids a 500-line page file. Alternative (one big file) rejected for maintainability during rapid demo iteration.

**2. Shared visual primitives: `AuroraBackground`, `GridPattern`, `Section`.**
- `AuroraBackground` — absolutely-positioned blurred gradient blobs (violet→cyan) animated with Framer Motion; `pointer-events-none`, sits behind content.
- `GridPattern` — an absolutely-positioned layer rendering a grid/dot pattern via CSS background (`linear-gradient`/`radial-gradient` tiles or an inline SVG), masked with `mask-image: radial-gradient(...)` so it fades toward edges; `pointer-events-none`.
- `Section` — wrapper standardizing vertical rhythm (`py-24`), `max-w-6xl` container, and heading style.
Rationale: DRY, consistent spacing, and the background layers are the signature "dynamic/crafted" look. Alternative (per-section ad-hoc backgrounds) rejected — inconsistent and duplicative.

**3. Grid pattern implemented with CSS, not an image asset.**
Use Tailwind arbitrary properties / a small utility in `index.css` (e.g. a `grid-pattern` utility using `background-image` + `background-size` + a radial `mask-image`). Rationale: scales crisply, themeable, no asset pipeline. Alternative (SVG/PNG asset) rejected to avoid asset management and to keep it token-driven.

**4. Motion strategy = Framer Motion `whileInView` reveals + a small looping budget.**
Scroll reveals fire once (`viewport={{ once: true }}`). Continuous motion limited to: aurora drift and 1–2 product-mockup micro-animations. A `useReducedMotion` hook gates all of it. Rationale: keeps it lively but not busy, and keeps performance acceptable on a demo laptop.

**5. Semantic accent per feature.**
Trend Feed = amber, Content Generation = violet, Analytics = emerald, Ask/Chat = cyan — accent applied only within that feature's row/mockup. Rationale: color-codes capabilities without turning the page into a rainbow; keeps violet as the global brand accent.

**6. Product mockups are faked, self-contained components — fed from one shared mock module.**
Each feature row renders lightweight mock UI (feed cards, streaming-text block, mini chart, chat bubbles) built from theme tokens + Tailwind, not real dashboard imports. All values (trend names + momentum %, chart series, headline stats, logos, testimonials, bento proof) live in a single `src/lib/mock/landing.ts` so numbers stay internally consistent across sections (e.g. the "AI Agents +184%" trend shown in the hero matches the feed mockup). Rationale: controlled, always demo-ready, and it reads as a real product instead of placeholder filler. The Hero's existing mockup stays as-is; it may reference the shared module but its layout is not changed.

**7. Theme-aware via semantic tokens (light + dark).**
Components use shadcn/Tailwind semantic tokens — `bg-background`/`bg-card`/`bg-muted`/`bg-secondary`, `text-foreground`/`text-muted-foreground`, `border-border`, `ring` — instead of hardcoded `bg-white/5`, `text-white`, `border-white/10`. `glass-card` is redefined to be theme-aware (a translucent tint over the current surface that works on both light and dark). Dark stays the default theme. Rationale: the app already ships a light palette in `index.css`; the landing must not break when toggled. Alternative (dark-only) rejected per the new requirement.

**8. Distinct per-section backgrounds.**
Sections alternate surface treatment to create visual rhythm: e.g. `bg-background` ↔ a subtle `bg-muted/40` (or `bg-card/30`) band, with a section-appropriate accent — the grid pattern behind some, a soft radial/gradient tint behind others, a top/bottom hairline border to separate bands. Aurora is reserved for Hero and the final CTA (the two "moments"), not every section. Rationale: differentiates sections without turning the page busy or fighting the theme. Alternative (one flat background) rejected per the new requirement. Constraint: all treatments must be defined with theme tokens so they hold up in light mode.

**9. Icons only — no emoji or unicode glyphs.**
Every indicator (trend up/down, live dot, check, arrows, social) uses a `lucide-react` icon; no emoji and no unicode symbols (↑, ↓, •, ×) in rendered copy. Bullet separators use spacing/`border`, not "•". Rationale: consistent rendering across platforms and a more professional look. This applies to any glyphs currently in the mockups (e.g. the "↑ 38%" chart caption becomes a `TrendingUp` icon + text).

**10. BentoGrid = concrete proof, not filler.**
The "Why Growth Studio" bento shows realistic, specific proof: an outcome metric with context (e.g. "10x faster from trend to publish"), a couple of capability tiles with real feature language, a small integrations/sources row (named channels), and one attributed testimonial (name, role, company) — all sourced from the shared mock module. Rationale: the current version reads generic; specificity builds credibility.

## Risks / Trade-offs

- **Overuse of motion feels gimmicky / hurts perf** → Strict motion budget (aurora + reveals + ≤2 loops), `once: true` reveals, and `prefers-reduced-motion` gating.
- **Grid + aurora reduce text contrast** → Keep pattern subtle (low opacity), radial-mask it away from text zones, and layer a subtle scrim behind headline text where needed.
- **Placeholder logos/testimonials look fake** → Use realistic, internally-consistent fictional wordmarks/quotes from the shared mock module; keep numbers plausible and consistent across sections.
- **Theme tokens look wrong in light mode** → Redefine `glass-card` and all section backgrounds with semantic tokens; verify every section in both light and dark before sign-off.
- **Per-section backgrounds fight the aurora/grid** → Reserve aurora for Hero + final CTA; use subtle muted/tinted bands elsewhere so the effects don't compete.
- **Grid `mask-image` browser support** → Include `-webkit-mask-image` fallback; degrade gracefully to an unmasked faint pattern.

## Migration Plan

1. Add primitives (`AuroraBackground`, `GridPattern`, `Section`) and any `index.css` utility.
2. Build sections incrementally; `Landing.tsx` composes whatever exists so the page is always runnable.
3. Verify at 375px and desktop, in dark mode, with reduced-motion on and off.
4. No data migration or rollback concerns — pure additive UI; reverting is removing the new components and restoring the old `Landing.tsx`.

## Open Questions

- Whether to add real screenshots later in place of faked mockups.
- Exact background palette per section (muted vs card tint, where hairline borders go) — to be tuned visually against both themes during implementation.
