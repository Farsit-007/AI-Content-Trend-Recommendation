## 1. Shared primitives & tokens

- [x] 1.1 Add a `grid-pattern` utility (grid/dot `background-image` + `background-size` + radial `mask-image` with `-webkit-mask-image` fallback) to `src/index.css`
- [x] 1.2 Create `src/components/landing/GridPattern.tsx` — absolutely-positioned, `pointer-events-none`, radial-masked grid/dot layer
- [x] 1.3 Create `src/components/landing/AuroraBackground.tsx` — blurred violet→cyan gradient blobs animated with Framer Motion, `pointer-events-none`, gated by `useReducedMotion`
- [x] 1.4 Create `src/components/landing/Section.tsx` — `py-24`, `max-w-6xl` container, standardized heading/eyebrow props

## 2. Hero

- [x] 2.1 Create `src/components/landing/Hero.tsx` with badge, `gradient-text` headline, subheadline, and dual CTA
- [x] 2.2 Layer `AuroraBackground` + `GridPattern` behind hero content with a text scrim for contrast
- [x] 2.3 Wire primary CTA to `/login` for guests and `/dashboard` for authenticated users via `useAuth`
- [x] 2.4 Add a faked product mockup visual (mock feed card with a `whileInView` reveal / micro-animation)

## 3. Feature showcase

- [x] 3.1 Create `src/components/landing/FeatureShowcase.tsx` rendering alternating left/right rows
- [x] 3.2 Build mini mockups for Trend Feed (amber), Content Generation (violet), Analytics (emerald), Ask/Chat (cyan)
- [x] 3.3 Apply per-feature semantic accent and `whileInView` fade-up reveals (`once: true`)
- [x] 3.4 Verify rows alternate orientation on desktop and stack to single column on mobile

## 4. How it works, CTA & footer

- [x] 4.1 Create `src/components/landing/HowItWorks.tsx` — three numbered steps (Track → Generate → Measure) with connecting line
- [x] 4.2 Create `src/components/landing/CtaSection.tsx` — full-width glass panel over aurora, `btn-glow` primary action to `/login`
- [x] 4.3 Create `src/components/landing/Footer.tsx` — product links, About link, social links, copyright

## 5. Social proof, bento & testimonials (polish)

- [x] 5.1 Create `src/components/landing/LogoCloud.tsx` — greyscale logo/metric strip
- [x] 5.2 Create `src/components/landing/BentoGrid.tsx` — asymmetric glass-card grid (stat + mini feature + quote)
- [x] 5.3 Create `src/components/landing/Testimonials.tsx` — quote cards (marquee or 3-up) with placeholder avatars

## 6. Compose & polish

- [x] 6.1 Recompose `src/pages/Landing.tsx` to render all sections in order
- [x] 6.2 Verify responsive layout at 375px with no horizontal overflow
- [x] 6.3 Verify dark-mode default rendering and contrast over grid/aurora backgrounds
- [x] 6.4 Verify `prefers-reduced-motion` disables aurora drift, reveals, and looping mockups
- [x] 6.5 Run `npm run lint` and `npm run build` (tsc) clean

## 7. Theme-aware (light + dark) — Hero excluded

- [x] 7.1 Redefine `glass-card` in `src/index.css` to be theme-aware (translucent surface tint that works in light and dark)
- [x] 7.2 Audit all landing components (except Hero) and replace hardcoded `bg-white/*`, `text-white`, `border-white/*` with semantic tokens (`bg-card`/`bg-muted`, `text-foreground`/`text-muted-foreground`, `border-border`)
- [x] 7.3 Verify every section is legible in light mode (no white-on-white, no invisible surfaces) and still correct in dark

## 8. Distinct section backgrounds

- [x] 8.1 Define an alternating background system with theme tokens (e.g. `bg-background` ↔ `bg-muted/40`, hairline dividers, per-section pattern/tint accents)
- [x] 8.2 Apply a distinct background to each section (LogoCloud, FeatureShowcase, HowItWorks, BentoGrid, Testimonials, CtaSection); leave Hero unchanged
- [x] 8.3 Limit the aurora background to Hero and CtaSection only

## 9. Realistic, data-driven content

- [x] 9.1 Create `src/lib/mock/landing.ts` as the single source for landing mock data (trends + momentum %, chart series, headline stats, logos, testimonials, integrations, bento proof)
- [x] 9.2 Wire FeatureShowcase mockups and any hero-referenced figures to the shared module so numbers stay consistent
- [x] 9.3 Rebuild BentoGrid ("Why Growth Studio") with concrete proof: contextual outcome metric, capability tiles, named integrations row, attributed testimonial
- [x] 9.4 Replace any emoji/unicode glyphs (e.g. "↑ 38%", "•") across landing components with `lucide-react` icons

## 10. Re-verify

- [x] 10.1 Confirm Hero is unchanged from the approved version
- [x] 10.2 Verify light + dark, 375px responsive, and `prefers-reduced-motion` all still hold
- [x] 10.3 Run `npm run lint` and `npm run build` (tsc) clean
