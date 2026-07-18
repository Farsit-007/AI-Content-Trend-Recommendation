## ADDED Requirements

### Requirement: Global Style Pack Corpus
The system SHALL provide style packs — globally shared, named writing styles with language, tone tags, an optional style card, and an active flag — each holding curated example posts stored with server-generated 1536-dimension embeddings. super_admins SHALL manage packs and examples via CRUD APIs; any authenticated user SHALL be able to list active packs and read a pack with its example count. Deleting a pack SHALL delete its examples. A bulk-import script SHALL idempotently seed a pack's examples from a JSON file.

#### Scenario: super_admin creates a pack and adds examples
- **WHEN** a super_admin creates pack `programming-hero` and posts an example with Bangla content
- **THEN** the example is stored with a 1536-dimension embedding generated from its content, and the pack's detail read reports the example count

#### Scenario: Non-super_admin cannot mutate
- **WHEN** an admin or regular user attempts to create/update/delete a pack or example
- **THEN** the request is rejected with HTTP 403

#### Scenario: Authenticated users list active packs
- **WHEN** any authenticated user lists style packs
- **THEN** active packs are returned with name, slug, description, language, and tone tags; inactive packs appear only for super_admin with `include_inactive`

#### Scenario: Idempotent seeding
- **WHEN** the seed script runs twice with the same file
- **THEN** the second run creates no duplicate examples and reports them skipped

#### Scenario: Deleting a pack cascades to its examples
- **WHEN** a super_admin deletes a style pack that has stored examples
- **THEN** the pack and every example referencing it are removed, and listing that pack's examples afterward returns none

#### Scenario: Retiring a pack via is_active
- **WHEN** a super_admin PATCHes a pack to `is_active: false`
- **THEN** the pack and its examples remain stored, but the pack no longer appears in the default (non-`include_inactive`) list

### Requirement: Team Default Style Pack
A team SHALL optionally reference a default style pack (`default_style_pack_id`), editable through the existing team update endpoint, validated as an ObjectId. A dangling reference (deleted/inactive pack) SHALL NOT make any team operation fail.

#### Scenario: Team default set
- **WHEN** an admin PATCHes a team with a valid `default_style_pack_id`
- **THEN** the team stores it and returns it on reads

#### Scenario: Team default cleared
- **WHEN** an admin PATCHes a team with `default_style_pack_id: null`
- **THEN** the team no longer has a default style pack on subsequent reads

#### Scenario: Dangling reference does not break team reads
- **WHEN** a team's `default_style_pack_id` points at a pack that has since been deleted
- **THEN** fetching or updating that team succeeds normally, unaffected by the missing pack
