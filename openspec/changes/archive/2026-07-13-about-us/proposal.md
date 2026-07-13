## Why

The Growth Studio landing page walks visitors through the problem, solution, features, and how it works — but never explains who is behind the product or why it exists. Without an "About Us" story, the page misses a chance to build trust, convey the team's mission, and give visitors a human reason to believe in the product before they hit the CTA.

## What Changes

- Add a new **About Us** section to the landing page that tells the Growth Studio story: mission, the problem the team set out to solve, and the values behind the product.
- Include a short set of team members (name, role, and optional avatar/initials) and/or a compact stats strip (e.g., sources monitored, platforms supported) to reinforce credibility.
- Add an **About** link to the desktop and mobile navigation, anchored to the new section via smooth scroll (consistent with existing `#problem`, `#solution`, etc.).
- Render the section on the home page in the existing section flow (between `HowItWorks` and `CTASection`).

## Capabilities

### New Capabilities
- `about-us-section`: A landing-page section that presents the Growth Studio mission, story, and team, plus a navigation entry point that scrolls to it.

### Modified Capabilities
<!-- No existing specs in openspec/specs/ change requirement-level behavior. -->

## Impact

- **New file:** `frontend/components/landing/AboutSection.tsx`
- **Modified:** `frontend/app/page.tsx` (render `AboutSection` in section order)
- **Modified:** `frontend/components/landing/Navbar.tsx` (add "About" nav link for desktop + mobile)
- **Dependencies:** None new — uses existing Tailwind CSS v4, shadcn/ui, and lucide-react.
- **No backend, API, or data changes.**
