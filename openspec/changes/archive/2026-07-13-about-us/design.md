## Context

The Growth Studio landing page (`frontend/app/page.tsx`) composes a fixed set of section components from `frontend/components/landing/`: `Hero`, `ProblemSection`, `SolutionSection`, `FeaturesSection`, `HowItWorks`, `CTASection`, and `Footer`. Each section is a self-contained module with a static, module-scoped data array and Tailwind CSS v4 utility styling using the shared design tokens (`background`, `foreground`, `muted-foreground`, `border`) plus a violet accent. `Navbar` is a `"use client"` component that renders anchor links from a `navLinks` array for both desktop and a mobile menu.

There is currently no section describing who is behind the product. This change adds one following the established pattern. No backend exists yet, and this is a static presentational change.

## Goals / Non-Goals

**Goals:**
- Add an `AboutSection` component that matches the existing landing-section structure and styling conventions.
- Surface the section via a new "About" navigation link in both desktop and mobile menus.
- Keep the content static and self-contained (no data fetching, no new dependencies).

**Non-Goals:**
- No dedicated `/about` route or page — this is an on-page anchored section.
- No backend, CMS, or dynamic team-data source.
- No new UI dependencies or design-token changes.

## Decisions

- **Anchored section over a separate route.** Every other landing section is an on-page anchor (`#problem`, `#solution`, …) reached via smooth scroll. An About Us section as `id="about"` keeps navigation consistent and avoids a route/layout for a single scroll target. Alternative (a `/about` page) was rejected as heavier than the hackathon landing page needs.

- **Server component with module-scoped data.** Following `SolutionSection`/`FeaturesSection`, the team member list and any stats live in a `const` array at module scope and the component renders without client-side state. It stays a server component (no `"use client"`) since it has no interactivity. Only `Navbar` needs client behavior, and it already has it.

- **Placement between `HowItWorks` and `CTASection`.** The narrative arc is problem → solution → features → how → *who we are* → call to action, so About sits just before the final CTA to build trust right before the ask.

- **Initials avatar fallback.** To avoid sourcing/bundling real photos for a hackathon, team avatars render as a violet-tinted circle with initials, matching the accent style used elsewhere. A real image can drop in later behind the same slot.

- **Nav link added to the shared `navLinks` array.** Adding `{ label: "About", href: "#about" }` to `Navbar`'s array automatically propagates to both the desktop nav and the mobile menu (which already maps the same array and closes on click), so no structural Navbar change is needed.

## Risks / Trade-offs

- **Nav crowding on desktop** → Adding a fifth link is within the current horizontal space; if it ever overflows, the mobile breakpoint already collapses links into the menu.
- **Placeholder team content** → Names/roles are placeholder copy for the hackathon; clearly editable in the module-scoped array so real details can replace them without touching markup.
- **Anchor scroll offset under the fixed navbar** → The fixed `Navbar` can overlap an anchored target; if the heading is clipped, apply `scroll-mt-*` to the section, consistent with how other sections behave.

## Migration Plan

Additive, presentational change with no data or API impact. Deploy is a standard frontend build. Rollback is reverting the new component render in `page.tsx` and removing the About nav link; no state or migration to unwind.
