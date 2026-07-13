## 1. Design System & Shared Utilities

- [x] 1.1 Add gradient text utility class to `frontend/app/globals.css`: `.gradient-text { @apply bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent; }`
- [x] 1.2 Add glassmorphism card utility: `.glass-card { @apply bg-white/5 backdrop-blur-sm border border-white/10; }`
- [x] 1.3 Add glow button utility: `.btn-glow { @apply shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:shadow-[0_0_50px_rgba(139,92,246,0.6)] transition-shadow; }`
- [x] 1.4 Install/verify `framer-motion` is available in `frontend/package.json`

## 2. Navbar

- [x] 2.1 Create `frontend/components/landing/Navbar.tsx` — sticky, `backdrop-blur-md bg-background/80 border-b border-white/10`
- [x] 2.2 Add Growth Studio wordmark (gradient text) + nav links: Features, How It Works
- [x] 2.3 Add primary CTA button (shadcn/ui `<Button>`) with gradient background in the navbar
- [x] 2.4 Add mobile hamburger menu that collapses nav links on viewports < 768px

## 3. Hero Section

- [x] 3.1 Create `frontend/components/landing/Hero.tsx`
- [x] 3.2 Apply gradient text to "Growth Studio" headline (`text-5xl md:text-7xl font-bold tracking-tight`)
- [x] 3.3 Add subheadline: "AI Content & Trend Intelligence — built for teams that can't afford to guess"
- [x] 3.4 Add dual CTA row: primary gradient button with glow + secondary ghost button
- [x] 3.5 Add stat badges row with three badges: "50+ sources monitored", "6 AI-powered features", "Real-time trend tracking" — styled as `rounded-full border border-white/15 px-4 py-1.5 text-sm`
- [x] 3.6 Wrap hero content in Framer Motion `motion.div` with `initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}`
- [x] 3.7 Add subtle radial gradient background glow behind hero text (violet, opacity 15%)

## 4. Problem Section

- [x] 4.1 Create `frontend/components/landing/ProblemSection.tsx`
- [x] 4.2 Add section heading: "The Problem" with muted subtext
- [x] 4.3 Build four glassmorphism problem cards in a `grid-cols-1 md:grid-cols-2` layout
- [x] 4.4 Each card: lucide-react icon (e.g., `EyeOff`, `Users`, `Zap`, `GitMerge`), card title, 2-line description
- [x] 4.5 Stagger cards with Framer Motion `variants` — each card `initial={{ opacity: 0, y: 16 }}` with 0.1s stagger

## 5. Solution Section

- [x] 5.1 Create `frontend/components/landing/SolutionSection.tsx`
- [x] 5.2 Asymmetric two-column layout on desktop: left = heading + body copy, right = solution cards
- [x] 5.3 Four solution cards with gradient-bordered left accent stripe (`border-l-2 border-violet-500`)
- [x] 5.4 Icons: `Rss`, `BarChart3`, `GitMerge`, `Sparkles` from lucide-react
- [x] 5.5 Wrap section in Framer Motion scroll animation

## 6. Features Bento Grid

- [x] 6.1 Create `frontend/components/landing/FeaturesSection.tsx`
- [x] 6.2 Build CSS grid with `grid-cols-3` on desktop, `grid-cols-1` on mobile
- [x] 6.3 Feature A — "News Feed Dashboard" (`col-span-2`): icon `Newspaper`, title, description + badge "Live"
- [x] 6.4 Feature B — "4-Layer AI Filter" (`col-span-1`): icon `Filter`, title, description
- [x] 6.5 Feature C — "Brand Voice RAG" (`col-span-1`): icon `Mic`, title, description
- [x] 6.6 Feature D — "Content Generator" (`col-span-2`): icon `PenTool`, title, description + badge "AI-Powered"
- [x] 6.7 Feature E — "Cross-Platform Analytics" (`col-span-3`): icon `BarChart2`, wide accent card with gradient border, title, description + inline metric pills
- [x] 6.8 Feature F — "Ask Growth Studio" (`col-span-1`): icon `MessageSquare`, title, description
- [x] 6.9 All cells: glass-card treatment + `hover:border-violet-500/30 transition-colors duration-300`
- [x] 6.10 Stagger bento cells with Framer Motion 0.08s between items

## 7. How It Works Section

- [x] 7.1 Create `frontend/components/landing/HowItWorks.tsx`
- [x] 7.2 Four steps: Monitor → Analyze → Cross-Reference → Generate
- [x] 7.3 Desktop: horizontal stepper — numbered circles connected by a gradient line (`bg-gradient-to-r from-violet-500 to-cyan-500 h-px`)
- [x] 7.4 Mobile: vertical stack — number circle above text
- [x] 7.5 Each step: gradient-bordered number circle, bold title, 1-line description
- [x] 7.6 Wrap in Framer Motion scroll animation

## 8. CTA Section

- [x] 8.1 Create `frontend/components/landing/CTASection.tsx`
- [x] 8.2 Full-width section with gradient background overlay (`bg-gradient-to-r from-violet-950/50 to-cyan-950/50`)
- [x] 8.3 Bold headline, subtext, and large primary CTA button with glow
- [x] 8.4 Add subtle grid pattern overlay (CSS `bg-[url(...)] opacity-5`) for texture

## 9. Footer

- [x] 9.1 Create `frontend/components/landing/Footer.tsx`
- [x] 9.2 Display "Growth Studio · Team Next Wave · AI Content & Trend Intelligence"
- [x] 9.3 Display "Hackathon Project · Jul 12–18, 2026"
- [x] 9.4 Footer uses `border-t border-white/10` top border

## 10. Page Assembly & Verification

- [x] 10.1 Update `frontend/app/page.tsx` to import and compose all landing sections in order: Navbar, Hero, ProblemSection, SolutionSection, FeaturesSection, HowItWorks, CTASection, Footer
- [x] 10.2 Verify no horizontal scroll at 375px viewport
- [x] 10.3 Verify gradient text renders correctly in Chrome, Firefox, and Safari
- [x] 10.4 Verify all Framer Motion animations trigger once on scroll in sequence
- [x] 10.5 Verify dark theme contrast meets WCAG AA on all text
- [x] 10.6 Run `npm run typecheck` — zero TypeScript errors
- [x] 10.7 Run `npm run build` — zero build errors
