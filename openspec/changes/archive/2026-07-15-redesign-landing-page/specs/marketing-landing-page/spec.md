## ADDED Requirements

### Requirement: Scroll-driven section layout

The landing page (`/`) SHALL present a vertically scrolling marketing narrative composed of ordered sections: Hero, LogoCloud (social proof), FeatureShowcase, HowItWorks, BentoGrid, Testimonials, CtaSection, and Footer. Each section SHALL be a discrete component under `src/components/landing/` and be composed within `Landing.tsx`.

#### Scenario: Visitor scrolls the full page

- **WHEN** a visitor loads `/` and scrolls from top to bottom
- **THEN** they encounter, in order, the hero, social-proof strip, feature showcase, how-it-works steps, bento grid, testimonials, final CTA, and footer

#### Scenario: Landing page is publicly accessible

- **WHEN** an unauthenticated visitor navigates to `/`
- **THEN** the full landing page renders without requiring login

### Requirement: Hero section

The Hero SHALL display a badge, a headline using the `gradient-text` token, a subheadline, a dual call-to-action (primary + secondary), and a product mockup visual. It SHALL render over the shared aurora gradient and crafted grid/dot background.

#### Scenario: Hero primary CTA for guests

- **WHEN** an unauthenticated visitor views the hero
- **THEN** the primary CTA links to `/login` (e.g. "Get started")

#### Scenario: Hero primary CTA for authenticated users

- **WHEN** an authenticated user views the hero
- **THEN** the primary CTA links to `/dashboard`

### Requirement: Crafted grid/dot background pattern

A shared `GridPattern` primitive SHALL render a subtle grid or dot background that is radial-masked to fade toward the edges of its container, layered behind foreground content without intercepting pointer events.

#### Scenario: Grid pattern renders behind content

- **WHEN** a section using `GridPattern` renders
- **THEN** the grid/dot pattern appears behind the section content, fades out toward the edges, and does not block clicks on foreground interactive elements

### Requirement: Animated aurora background

A shared `AuroraBackground` primitive SHALL render an animated violet→cyan gradient mesh that drifts slowly, layered behind foreground content.

#### Scenario: Aurora animates when motion is allowed

- **WHEN** a visitor with motion enabled views a section using the aurora background
- **THEN** the gradient mesh animates with a slow continuous drift

### Requirement: Feature showcase of real capabilities

FeatureShowcase SHALL present the platform's four capabilities — Trend Feed, Content Generation, Analytics/Report, and Ask/Chat — as alternating left/right rows, each with a title, description, a mini product mockup, and its semantic accent color (Trend Feed = amber, Content Generation = violet, Analytics = emerald, Ask/Chat = cyan).

#### Scenario: All four capabilities are shown

- **WHEN** a visitor reaches the feature showcase
- **THEN** rows for Trend Feed, Content Generation, Analytics, and Ask/Chat are each displayed with their respective accent color and a mockup

#### Scenario: Rows alternate orientation

- **WHEN** the feature showcase renders on desktop
- **THEN** consecutive feature rows alternate the visual/text on opposite sides

### Requirement: How-it-works funnel

HowItWorks SHALL present a three-step flow — Track trends, Generate content, Measure what works — as numbered steps.

#### Scenario: Three ordered steps are shown

- **WHEN** a visitor reaches the how-it-works section
- **THEN** three numbered steps labeled Track, Generate, and Measure are displayed in order

### Requirement: Conversion CTA and footer

The page SHALL end with a final CtaSection containing a headline and a primary action using the `btn-glow` token, followed by a Footer with product links, an About link, social links, and a copyright line.

#### Scenario: Final CTA drives sign-up

- **WHEN** a visitor reaches the final CTA section
- **THEN** a prominent glowing call-to-action button is displayed linking guests to `/login`

#### Scenario: Footer provides navigation

- **WHEN** a visitor reaches the footer
- **THEN** product links, an About link, social links, and a copyright line are displayed

### Requirement: Responsive, theme-aware presentation

The landing page SHALL be mobile-first responsive down to a 375px viewport and SHALL render correctly and legibly in BOTH light and dark themes, using shadcn/Tailwind semantic tokens (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`) rather than hardcoded white/black colors. Dark SHALL remain the default theme, and shared tokens (`glass-card`, `gradient-text`, `btn-glow`) SHALL be theme-aware.

#### Scenario: Renders on a small viewport

- **WHEN** the page is viewed at 375px width
- **THEN** all sections reflow to a single-column, readable layout with no horizontal overflow

#### Scenario: Dark mode is the default

- **WHEN** the page loads with no theme preference set
- **THEN** it renders in dark mode

#### Scenario: Light mode is fully legible

- **WHEN** the theme is toggled to light
- **THEN** every section, card, and mockup remains legible with sufficient contrast and no white-on-white or invisible surfaces

### Requirement: Distinct section backgrounds

Each landing section (other than the Hero) SHALL use a differentiated background treatment so sections read as separate bands, using theme tokens so the treatment holds in both light and dark. The animated aurora background SHALL be reserved for the Hero and the final CtaSection.

#### Scenario: Adjacent sections are visually distinct

- **WHEN** a visitor scrolls between two consecutive sections
- **THEN** the sections are visually separated by a differing background surface, tint, pattern accent, or divider

#### Scenario: Aurora is limited to key moments

- **WHEN** the page renders
- **THEN** the aurora gradient appears only behind the Hero and the final CtaSection, not behind every section

### Requirement: Icons only, no emoji

All indicators, bullets, and glyphs in the landing UI SHALL be rendered with `lucide-react` icons. The landing page SHALL NOT use emoji or decorative unicode symbols (such as ↑, ↓, •, ×) in rendered copy.

#### Scenario: No emoji or unicode glyphs

- **WHEN** any landing section renders
- **THEN** every status/indicator/bullet is a lucide icon and no emoji or decorative unicode symbol appears in the visible text

### Requirement: Realistic, internally-consistent content

All mock content on the landing page (trend feed items, chart series, headline stats, logos, testimonials, and bento proof) SHALL be sourced from a single shared mock module and SHALL be internally consistent — figures referenced in more than one place SHALL match, and copy SHALL read as a real product rather than placeholder filler.

#### Scenario: Shared figures are consistent across sections

- **WHEN** a metric or trend appears in more than one section (e.g. a trending topic shown in both the hero and the feature feed mockup)
- **THEN** the value is the same in each place because both read from the shared mock module

#### Scenario: Content reads as real

- **WHEN** a visitor reads the mockups, stats, and testimonials
- **THEN** the content is specific and plausible (named channels, concrete percentages, attributed quotes) with no lorem-ipsum or contradictory numbers

### Requirement: Proof-focused "Why Growth Studio" section

The BentoGrid ("Why Growth Studio") SHALL present concrete, credible proof rather than generic filler: at least one outcome metric with context, capability tiles using real feature language, a row of named integrations/sources, and one attributed testimonial (name, role, company) — all from the shared mock module.

#### Scenario: Bento shows concrete proof

- **WHEN** a visitor reaches the "Why Growth Studio" section
- **THEN** it displays a contextual outcome metric, capability tiles, named integrations/sources, and an attributed testimonial

### Requirement: Reduced-motion accessibility

All animations on the landing page SHALL respect the user's `prefers-reduced-motion` setting.

#### Scenario: Motion is suppressed on request

- **WHEN** a visitor has `prefers-reduced-motion: reduce` set
- **THEN** aurora drift, scroll reveals, and looping mockup animations are disabled or reduced to a static presentation
