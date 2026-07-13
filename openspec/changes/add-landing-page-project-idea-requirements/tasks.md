## 1. Project Scaffold

- [x] 1.1 Initialize Vite + React project inside `frontend/` with `npm create vite@latest . -- --template react`
- [x] 1.2 Install Tailwind CSS v3 and configure `tailwind.config.js` and `postcss.config.js`
- [x] 1.3 Set up global CSS in `src/index.css` with Tailwind directives and dark base styles
- [x] 1.4 Clean up Vite boilerplate (remove `App.css`, reset `App.jsx`)

## 2. Layout & Navigation

- [x] 2.1 Create `src/components/Navbar.jsx` with Growth Studio logo/wordmark and nav links (Problem, Features, How It Works)
- [x] 2.2 Create `src/pages/LandingPage.jsx` that composes all section components top-to-bottom
- [x] 2.3 Update `src/App.jsx` to render `LandingPage`

## 3. Hero Section

- [x] 3.1 Create `src/components/Hero.jsx` with headline "Growth Studio", tagline, and CTA button
- [x] 3.2 Add gradient background or subtle animated background to hero
- [x] 3.3 Ensure hero is full-viewport height with centered content

## 4. Problem Section

- [x] 4.1 Create `src/components/ProblemSection.jsx` with four problem cards
- [x] 4.2 Each card covers one of the four problems: trend visibility, audience understanding, content speed, trend-audience gap
- [x] 4.3 Style cards with border, icon/emoji, and short description text

## 5. Solution Section

- [x] 5.1 Create `src/components/SolutionSection.jsx` listing Growth Studio's four capabilities
- [x] 5.2 Use a 2-column or numbered list layout with icons

## 6. Features Grid

- [x] 6.1 Create `src/components/FeaturesSection.jsx` with a responsive grid
- [x] 6.2 Add at least 6 feature cards: News Feed Dashboard, 4-Layer AI Filter, Content Generator, Brand Voice RAG, Cross-Platform Analytics, Ask Growth Studio Chat
- [x] 6.3 Each card has an emoji/icon, title, and one-line description
- [x] 6.4 Grid uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for responsiveness

## 7. How It Works Section

- [x] 7.1 Create `src/components/HowItWorks.jsx` with a 4-step flow
- [x] 7.2 Steps: Monitor → Analyze → Cross-Reference → Generate
- [x] 7.3 Style as a horizontal stepper on desktop, vertical stack on mobile

## 8. CTA & Footer

- [x] 8.1 Create `src/components/CTASection.jsx` with a final call-to-action block
- [x] 8.2 Create `src/components/Footer.jsx` with "Growth Studio · Team Next Wave · AI Content & Trend Recommendation"
- [x] 8.3 Footer includes hackathon context (Jul 12–18, 2026)

## 9. Polish & Verification

- [x] 9.1 Verify mobile layout at 375px viewport (single column, no horizontal scroll)
- [x] 9.2 Verify dark theme contrast is sufficient on all text
- [x] 9.3 Run `npm run build` and confirm no build errors
- [x] 9.4 Update `CLAUDE.md` with frontend dev server command (`npm run dev`)
