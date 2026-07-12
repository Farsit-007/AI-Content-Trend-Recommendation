## ADDED Requirements

### Requirement: About Us section on the landing page

The landing page SHALL render an "About Us" section that communicates the TrendBridge mission and story. The section MUST have a stable anchor id of `about` so it can be linked to from navigation, and MUST follow the existing section layout conventions (centered eyebrow badge, heading, and supporting copy).

#### Scenario: Section is present on the home page

- **WHEN** a visitor loads the landing page (`/`)
- **THEN** an About Us section with `id="about"` is rendered in the main content flow between the "How It Works" and CTA sections

#### Scenario: Section presents mission and story

- **WHEN** a visitor views the About Us section
- **THEN** it displays a heading, a short mission statement, and story/values copy describing why TrendBridge exists

### Requirement: Team and credibility content

The About Us section SHALL present credibility content: a set of team members (each with at least a name and role) and/or a compact stats strip. Each team member MUST show a name and role; an avatar image or initials fallback MAY be shown.

#### Scenario: Team members are displayed

- **WHEN** a visitor views the About Us section
- **THEN** each listed team member shows a name and a role

#### Scenario: Avatar fallback

- **WHEN** a team member has no avatar image
- **THEN** an initials-based placeholder is shown in place of the image

### Requirement: About navigation entry

The site navigation SHALL include an "About" link that points to the `#about` anchor, and it MUST be available in both the desktop navigation and the mobile menu. Activating the link MUST scroll the About Us section into view; selecting it in the mobile menu MUST also close the menu.

#### Scenario: Desktop navigation link

- **WHEN** a visitor clicks the "About" link in the desktop navigation
- **THEN** the page scrolls to the About Us section (`#about`)

#### Scenario: Mobile navigation link

- **WHEN** a visitor opens the mobile menu and taps the "About" link
- **THEN** the page scrolls to the About Us section and the mobile menu closes

### Requirement: Responsive and theme-consistent styling

The About Us section SHALL be responsive across mobile and desktop breakpoints and MUST use the existing design tokens (`background`, `foreground`, `muted-foreground`, `border`, and the violet accent) so it renders correctly in the default dark theme.

#### Scenario: Responsive layout

- **WHEN** the section is viewed on a narrow (mobile) viewport
- **THEN** its content reflows into a single-column layout without horizontal overflow

#### Scenario: Theme consistency

- **WHEN** the section is rendered in the default dark theme
- **THEN** it uses the existing design tokens and violet accent consistent with the other landing sections
