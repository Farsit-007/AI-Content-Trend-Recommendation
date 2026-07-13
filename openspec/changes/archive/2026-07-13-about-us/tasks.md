## 1. Build the About Us section component

- [x] 1.1 Create `frontend/components/landing/AboutSection.tsx` as a server component with `id="about"`, following the layout of `SolutionSection` (eyebrow badge, heading, supporting copy)
- [x] 1.2 Add module-scoped `teamMembers` data array (name, role, optional avatar, initials) and static mission/story copy
- [x] 1.3 Render the mission/story block and a team grid; use an initials placeholder (violet-tinted circle) when a member has no avatar image
- [x] 1.4 Optionally add a compact stats strip (e.g., sources monitored, platforms supported) for credibility
- [x] 1.5 Style with existing design tokens and violet accent; make the layout responsive (single column on mobile, grid on desktop) and add `scroll-mt` to offset the fixed navbar

## 2. Wire the section into the page and navigation

- [x] 2.1 Import and render `AboutSection` in `frontend/app/page.tsx` between `HowItWorks` and `CTASection`
- [x] 2.2 Add `{ label: "About", href: "#about" }` to the `navLinks` array in `frontend/components/landing/Navbar.tsx` (propagates to desktop + mobile menu)

## 3. Verify

- [x] 3.1 Run `cd frontend && npm run typecheck` and `npm run lint` — both pass
- [x] 3.2 Run `cd frontend && npm run dev` and confirm the About section renders, the "About" nav link scrolls to it, and the mobile menu link closes the menu on tap
