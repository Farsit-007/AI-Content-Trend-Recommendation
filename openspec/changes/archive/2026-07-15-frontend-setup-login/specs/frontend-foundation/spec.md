## ADDED Requirements

### Requirement: Styling and UI component system

The frontend SHALL use Tailwind CSS v4 (via the `@tailwindcss/vite` plugin) as its styling system and shadcn/ui for reusable components, with a `cn()` class-merge helper and dark mode as the default theme.

#### Scenario: Tailwind utilities render

- **WHEN** the app is built and served
- **THEN** Tailwind utility classes and shadcn/ui components render with the configured theme tokens

#### Scenario: Dark mode is the default

- **WHEN** the app first loads with no prior theme preference
- **THEN** the `dark` class is present on the root `<html>` element and the UI renders in dark mode

### Requirement: Client-side routing

The frontend SHALL use React Router v7 for navigation, exposing a public `/login` route and at least one authenticated route.

#### Scenario: Unknown route

- **WHEN** the user navigates to a path that does not exist
- **THEN** the router resolves without crashing (renders a fallback or redirect)

### Requirement: Server-state provider

The frontend SHALL provide a TanStack Query `QueryClient` at the application root so components can use queries and mutations, with retries disabled for 4xx responses.

#### Scenario: Query provider available

- **WHEN** any component calls a TanStack Query hook
- **THEN** it resolves against the app-level `QueryClient` without a "no QueryClient set" error

### Requirement: Shared API client with configured transport

The frontend SHALL expose a single shared axios instance whose `baseURL` comes from `VITE_API_URL` and which sends credentials (`withCredentials: true`) on every request.

#### Scenario: Requests target the configured API

- **WHEN** any API call is made through the shared client
- **THEN** the request URL is prefixed with `VITE_API_URL` and includes credentials so cookies are sent

### Requirement: Response envelope unwrapping and error normalization

The API client SHALL unwrap the backend success envelope so callers receive the `data` payload (and `meta` when present), and SHALL normalize backend error envelopes (`{ success: false, message, errorSource[] }`) into a consistent error object carrying a human-readable message.

#### Scenario: Success payload is unwrapped

- **WHEN** the backend returns `{ success: true, message, data }`
- **THEN** the calling code receives the `data` value directly

#### Scenario: Error is normalized

- **WHEN** the backend returns a non-2xx response with an error envelope
- **THEN** the client rejects with a normalized error exposing the backend's `message` for display
