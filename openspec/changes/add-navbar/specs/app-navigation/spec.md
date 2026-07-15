## ADDED Requirements

### Requirement: Public and protected route split

The system SHALL separate public routes from the authenticated dashboard. Public routes (`/` landing, `/about`, `/login`) SHALL be reachable without authentication. The dashboard SHALL live under `/dashboard/*` and SHALL be gated by authentication, redirecting unauthenticated users to `/login`.

#### Scenario: Public pages reachable without auth

- **WHEN** an unauthenticated visitor navigates to `/` or `/about`
- **THEN** the page renders without redirecting to login

#### Scenario: Dashboard requires auth

- **WHEN** an unauthenticated visitor navigates to any `/dashboard/*` route
- **THEN** they are redirected to `/login`

#### Scenario: Login lands on dashboard

- **WHEN** a user successfully logs in (or visits `/login` while already authenticated)
- **THEN** they are taken to `/dashboard`

### Requirement: Persistent app-shell navbar

The system SHALL render a persistent top navigation bar on every `/dashboard/*` route via a shared app-shell layout. The navbar SHALL contain the Growth Studio brand on the left, primary navigation next to it, and auth actions on the right.

#### Scenario: Navbar visible on dashboard routes

- **WHEN** an authenticated user views any `/dashboard/*` route
- **THEN** the app navbar is rendered above the route content
- **AND** the routed page content renders in the shell's outlet below the navbar

#### Scenario: App navbar not shown on public pages

- **WHEN** a user views `/`, `/about`, or `/login`
- **THEN** the authenticated app navbar is not rendered (public pages use a separate lightweight public navbar; `/login` has none)

### Requirement: Public navbar

Public routes (`/`, `/about`) SHALL render a lightweight public navbar containing the Growth Studio brand linking to `/`, public links (Home, About), and an auth-aware call to action: "Log in" (to `/login`) for anonymous visitors, or "Dashboard" (to `/dashboard`) when already authenticated. The public navbar SHALL NOT show a "Sign up" action.

#### Scenario: Anonymous visitor sees Log in

- **WHEN** an unauthenticated visitor views a public page
- **THEN** the public navbar shows a "Log in" action and no "Sign up" action

#### Scenario: Authenticated visitor sees Dashboard shortcut

- **WHEN** an authenticated user views a public page
- **THEN** the public navbar shows a "Dashboard" action instead of "Log in"

### Requirement: Brand and navigation links

The app navbar SHALL display the "Growth Studio" brand using the `gradient-text` token, linking to `/dashboard`. It SHALL display primary navigation links that route to real dashboard sections: Feed (`/dashboard/feed`), Generate (`/dashboard/generate`), Report (`/dashboard/report`), and Chat (`/dashboard/chat`).

#### Scenario: Brand links to dashboard home

- **WHEN** the user clicks the brand/logo in the app navbar
- **THEN** the app navigates to `/dashboard`

#### Scenario: Active link is highlighted

- **WHEN** the current route matches a nav link's target
- **THEN** that link is rendered in an active/highlighted state distinct from inactive links

### Requirement: Role-aware Admin link

The app navbar SHALL show the Admin link (`/dashboard/admin`) only when the authenticated user's `role` is `admin` or `super_admin`. Users with role `user` SHALL NOT see the Admin link.

#### Scenario: Admin sees Admin link

- **WHEN** a user with role `admin` or `super_admin` views the navbar
- **THEN** the Admin link is present

#### Scenario: Regular user does not see Admin link

- **WHEN** a user with role `user` views the navbar
- **THEN** the Admin link is absent from both desktop and mobile menus

### Requirement: Auth-aware account section

The navbar SHALL display the authenticated user's name and role, and provide a Log out action. It SHALL NOT display a public "Sign up" or "Register" call to action.

#### Scenario: Shows current user identity

- **WHEN** an authenticated user views the navbar
- **THEN** their `name` and `role` are displayed in the account section

#### Scenario: Log out

- **WHEN** the user activates the Log out action
- **THEN** the app calls `logout()` from the auth context and the user is returned to the login flow

#### Scenario: No signup CTA

- **WHEN** the navbar renders
- **THEN** no "Sign up" / "Register" button is present

### Requirement: Theme toggle

Both the app navbar and the public navbar SHALL provide a theme toggle button that switches between dark and light mode by toggling the `dark` class on the document root. The selected theme SHALL persist across reloads and default to dark.

#### Scenario: Toggle switches theme

- **WHEN** the user activates the theme toggle
- **THEN** the app switches between dark and light mode (the `dark` class on `<html>` is added/removed)

#### Scenario: Theme persists

- **WHEN** the user has selected a theme and reloads the app
- **THEN** the previously selected theme is applied before first paint

#### Scenario: Defaults to dark

- **WHEN** a user with no stored preference loads the app
- **THEN** dark mode is applied

### Requirement: Responsive mobile navigation

Below the `md` breakpoint the navbar SHALL collapse primary links and auth actions into a toggleable mobile menu (sheet/drawer). The mobile menu SHALL contain the same links (subject to role rules) and Log out action as the desktop navbar.

#### Scenario: Mobile menu toggles

- **WHEN** the viewport is below `md` and the user activates the menu trigger
- **THEN** a panel opens showing the nav links and Log out action

#### Scenario: Navigating closes the mobile menu

- **WHEN** the user selects a link inside the open mobile menu
- **THEN** the app navigates to that route and the mobile menu closes

#### Scenario: Renders at 375px

- **WHEN** the navbar is viewed at 375px width in dark mode
- **THEN** it renders without horizontal overflow and all controls remain reachable
