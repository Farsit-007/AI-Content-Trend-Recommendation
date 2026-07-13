## ADDED Requirements

### Requirement: Landing page renders hero section
The page SHALL display a full-viewport hero section with Growth Studio's gradient headline, subheadline, dual CTA buttons, and an animated stat badges row.

#### Scenario: Hero section visible on load
- **WHEN** a user opens the landing page
- **THEN** the hero section SHALL be the first visible content with a gradient headline "Growth Studio", the tagline "AI Content & Trend Intelligence — built for teams that can't afford to guess", and at least two CTA buttons

#### Scenario: Gradient text applied to headline
- **WHEN** the hero headline renders
- **THEN** the text SHALL use a violet-to-cyan gradient (`bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent`)

#### Scenario: Stat badges rendered below headline
- **WHEN** the hero section renders
- **THEN** a row of at least three stat badges SHALL be visible (e.g., "50+ sources monitored", "6 AI-powered features", "Real-time trend tracking") styled as pill badges with muted borders

#### Scenario: Dual CTA buttons present
- **WHEN** the hero section is rendered
- **THEN** a primary button with gradient background and glow shadow SHALL be visible alongside a secondary ghost button

### Requirement: Sticky glassmorphism navbar
The page SHALL include a sticky navigation bar at the top that uses a glassmorphism treatment.

#### Scenario: Navbar sticks on scroll
- **WHEN** the user scrolls past the hero section
- **THEN** the navbar SHALL remain fixed at the top of the viewport

#### Scenario: Navbar glassmorphism treatment
- **WHEN** the navbar renders over page content
- **THEN** it SHALL use `backdrop-blur-md bg-background/80 border-b border-white/10` styling

#### Scenario: Navbar contains anchor links
- **WHEN** the navbar is rendered
- **THEN** it SHALL contain links to Features, How It Works, and a CTA button

### Requirement: Landing page communicates the problem
The page SHALL include a problem section that presents the four core problems faced by the Programming Hero marketing team using glassmorphism cards.

#### Scenario: Four problem cards rendered
- **WHEN** the user scrolls to the problem section
- **THEN** four problem cards SHALL be displayed covering: trend visibility, audience understanding, content creation speed, and trend-audience connection gap

#### Scenario: Cards use glassmorphism treatment
- **WHEN** each problem card renders
- **THEN** it SHALL use `bg-white/5 backdrop-blur-sm border border-white/10` with a lucide-react icon and short description

### Requirement: Landing page presents the solution
The page SHALL include a solution section explaining how Growth Studio addresses the four problems, using an asymmetric two-column layout.

#### Scenario: Solution points visible
- **WHEN** the user scrolls to the solution section
- **THEN** four solution points SHALL be listed: Monitors trends, Analyzes platform performance, Cross-references trends with audience data, Generates multi-format content

#### Scenario: Asymmetric layout on desktop
- **WHEN** the solution section renders on a viewport ≥ 1024px
- **THEN** the layout SHALL use a two-column split with descriptive copy on one side and solution cards on the other

### Requirement: Landing page highlights core features in a bento grid
The page SHALL display features in a bento grid layout where cells have variable sizes, creating visual hierarchy.

#### Scenario: Bento grid renders with variable cell sizes
- **WHEN** the user scrolls to the features section
- **THEN** at least six feature cells SHALL be visible with at least one cell spanning two columns and at least one cell spanning full width

#### Scenario: Primary features occupy large cells
- **WHEN** the bento grid renders
- **THEN** the most important features (Content Generator, Ask Growth Studio Chat) SHALL occupy `col-span-2` or larger cells

#### Scenario: All bento cells use glassmorphism
- **WHEN** each feature cell renders
- **THEN** it SHALL use `bg-white/5 backdrop-blur-sm border border-white/10 hover:border-violet-500/30 transition-colors` and display a lucide-react icon, title, and one-line description

#### Scenario: Bento grid collapses to single column on mobile
- **WHEN** the page is viewed on a viewport < 768px
- **THEN** all bento cells SHALL render as `col-span-1` in a single-column stack

### Requirement: Sections animate in on scroll
The page SHALL use Framer Motion scroll-triggered animations on every major section.

#### Scenario: Sections fade and slide in on scroll
- **WHEN** a section enters the viewport
- **THEN** it SHALL animate from `opacity: 0, y: 20` to `opacity: 1, y: 0` over 0.5s with `easeOut` easing

#### Scenario: Card children stagger on entry
- **WHEN** a section with multiple cards enters the viewport
- **THEN** each card SHALL animate in sequence with a 0.1s stagger delay between items

#### Scenario: Animations fire once
- **WHEN** a section has already animated in
- **THEN** scrolling back up and down SHALL NOT re-trigger the animation (`viewport={{ once: true }}`)

### Requirement: Landing page is mobile responsive
The page SHALL render correctly on mobile viewports (≥320px) and desktop viewports (≥1024px) with no horizontal scrolling.

#### Scenario: No horizontal scroll on any viewport
- **WHEN** the page is viewed at any viewport ≥ 320px wide
- **THEN** no horizontal scrollbar SHALL appear and no content SHALL be clipped

#### Scenario: Typography scales down on mobile
- **WHEN** the page is viewed on a viewport < 768px
- **THEN** the hero headline SHALL render at `text-5xl` or smaller, and all body text SHALL remain readable

### Requirement: Landing page uses a dark theme with gradient accents
The page SHALL use a dark color scheme with a consistent violet-to-cyan gradient accent identity.

#### Scenario: Background and text contrast
- **WHEN** the page renders
- **THEN** the background SHALL be dark (zinc-950 equivalent) and all body text SHALL meet WCAG AA contrast minimum

#### Scenario: Gradient accent applied consistently
- **WHEN** the page renders
- **THEN** the violet-to-cyan gradient SHALL appear on the hero headline, the primary CTA button, and at least one decorative element per section

### Requirement: Landing page includes a How It Works section
The page SHALL include a four-step process section showing the Growth Studio workflow.

#### Scenario: Four steps rendered
- **WHEN** the user scrolls to the How It Works section
- **THEN** four numbered steps SHALL be visible: Monitor → Analyze → Cross-Reference → Generate

#### Scenario: Horizontal stepper on desktop
- **WHEN** the section renders on a viewport ≥ 1024px
- **THEN** the steps SHALL display horizontally with a connecting line between numbered circles

#### Scenario: Vertical stack on mobile
- **WHEN** the section renders on a viewport < 768px
- **THEN** the steps SHALL stack vertically

### Requirement: Landing page includes a footer
The page SHALL include a footer with the project name, team name, and hackathon context.

#### Scenario: Footer content
- **WHEN** the user scrolls to the bottom of the page
- **THEN** the footer SHALL display "Growth Studio · Team Next Wave · AI Content & Trend Intelligence" and "Hackathon Project · Jul 12–18, 2026"
