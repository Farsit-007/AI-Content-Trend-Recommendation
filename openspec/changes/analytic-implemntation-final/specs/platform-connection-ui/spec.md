## ADDED Requirements

### Requirement: Platforms settings page

The system SHALL provide a Platforms settings page that renders each platform's connection state and lets a team admin connect or disconnect Facebook.

#### Scenario: Not-connected Facebook card

- **WHEN** an admin views the Platforms page with no Facebook credential
- **THEN** the Facebook card shows a "Connect Facebook Page" CTA and the prerequisite checklist (Page admin role, IG Professional account linked).

#### Scenario: Start the connect popup

- **WHEN** the admin clicks "Connect Facebook Page"
- **THEN** the app calls `GET /oauth/facebook/connect?teamId=<id>` and opens the returned URL in a popup window.

#### Scenario: Page picker after redirect

- **WHEN** the OAuth popup redirects to `/dashboard/settings/platforms?fb=pick`
- **THEN** the opener fetches `GET /oauth/facebook/pages`, shows a modal listing the pages (name, avatar, "IG linked" badge), and on selection calls `POST /oauth/facebook/select-page { pageId }`.

#### Scenario: Connected state

- **WHEN** a Facebook credential exists and its rollup status is not `not_connected`
- **THEN** the card shows the page name/avatar, IG username badge, "connected by {user} on {date}", and a Disconnect button that confirms then calls `DELETE /oauth/facebook`.

#### Scenario: Needs-reconnect state

- **WHEN** a Facebook credential exists but the rollup status is `not_connected`
- **THEN** the card shows an amber "Facebook connection expired — reconnect" banner with the connect CTA.

#### Scenario: Deferred platforms shown as coming soon

- **WHEN** the page renders YouTube, LinkedIn, X, or TikTok cards
- **THEN** they appear in a disabled "Coming soon" state.
