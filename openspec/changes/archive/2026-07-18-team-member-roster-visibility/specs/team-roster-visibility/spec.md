## ADDED Requirements

### Requirement: Team Settings shows the full member roster
The Team Settings page (`/dashboard/settings/team`) SHALL display every member of the current
team, with each member's name, email, and role, using data already returned by `GET /teams/:id`.

#### Scenario: Regular team member views Team Settings
- **WHEN** a non-admin user who belongs to a team opens `/dashboard/settings/team`
- **THEN** they see a list of every team member (name, email, role), not an empty or missing
  section

#### Scenario: A team with only one member
- **WHEN** the team has exactly one member (its creator)
- **THEN** that one member is still listed, not treated as an empty state

### Requirement: Admins can remove a member from their own Team Settings page
An admin or super_admin viewing their own Team Settings page SHALL be able to remove a member
directly from the roster, using the existing `DELETE /teams/:id/members/:userId` endpoint.

#### Scenario: Admin removes a member
- **WHEN** an admin clicks remove next to a member's row on Team Settings
- **THEN** the member is removed from the team and the roster updates to reflect it

#### Scenario: Non-admin has no remove control
- **WHEN** a non-admin user (whose global role is `user`) views Team Settings
- **THEN** no remove action is shown next to any member row
