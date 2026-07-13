## Context

Growth Studio is a hackathon project (Jul 12–18, 2026) built as a full marketing intelligence platform for the Programming Hero team. The `frontend/` directory is currently empty. We need a landing page that serves as the product's public face — communicating the value proposition to both hackathon judges and prospective users in a polished, dark-themed, modern design.

The landing page is purely static (no API calls), built with React + Vite, and styled with Tailwind CSS. No auth or dynamic data is needed.

## Goals / Non-Goals

**Goals:**
- Scaffold the React + Vite + Tailwind frontend project inside `frontend/`
- Build a single-page landing page with sections: Hero, Problem, Solution, Features, How It Works, and CTA
- Match Growth Studio's aesthetic: dark theme, tech-focused, Bangladeshi edtech audience
- Mobile-responsive layout

**Non-Goals:**
- No backend integration or API calls
- No authentication or user accounts
- No real-time data on the landing page
- No routing beyond single page (no react-router needed)

## Decisions

### React + Vite over Next.js
Vite gives zero-config fast dev startup for a hackathon. Next.js SSR overhead is unnecessary for a single static marketing page. Vite ships faster with less boilerplate.

### Tailwind CSS over CSS Modules / Styled Components
Tailwind lets us build the entire layout quickly with utility classes — ideal for hackathon pace. No context switching between files. Dark mode via `dark:` prefix or a root class.

### Single-file component approach (sections as components)
Each landing page section is a standalone React component in `src/components/`. They are composed top-to-bottom in `src/pages/LandingPage.jsx`. This keeps code scannable and sections independently editable.

### No external UI library (Radix, shadcn)
Adding a UI library requires configuration time. All visual elements (cards, badges, buttons) are simple enough to build with Tailwind in a hackathon window.

## Risks / Trade-offs

- [Tailwind purge in dev] → Non-issue: Vite's Tailwind plugin handles it automatically.
- [Hero section copy clarity] → Mitigation: Use the one-liner from requirements doc verbatim: "Growth Studio combines what's trending in tech with what works on YOUR channels."
- [Mobile layout complexity for feature grid] → Mitigation: Use CSS grid with `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` breakpoints.
