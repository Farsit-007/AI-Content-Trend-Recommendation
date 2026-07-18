## ADDED Requirements

### Requirement: Style-Pack-Conditioned Generation
`POST /content/generate` SHALL accept an optional `style_pack_id`, resolving the effective pack as request override → team default → none, ignoring (with a warning log) packs that are missing or inactive. When a pack resolves, the system prompt SHALL include the pack's style card (when present) and its top topic-similar examples as the primary style authority, ordered before the team's own brand-voice examples, and generation SHALL use styled prompting even for teams with zero brand-voice examples. When no pack resolves, behavior SHALL be identical to pre-change (including the brand-neutral cold-start path).

#### Scenario: Pack examples steer the prompt
- **WHEN** generation runs with a resolved style pack holding topic-relevant examples
- **THEN** the LLM system prompt contains the style card and pack example texts ahead of any team brand-voice examples

#### Scenario: Request override beats team default
- **WHEN** a request supplies `style_pack_id` differing from the team's default
- **THEN** the request's pack is used

#### Scenario: Dangling pack soft-fails
- **WHEN** the team's default pack was deleted
- **THEN** generation succeeds without a pack, logging a warning

#### Scenario: New team + pack is not brand-neutral
- **WHEN** a team with zero brand-voice examples generates with a pack selected
- **THEN** the styled prompt branch is used, not the brand-neutral cold-start text

## MODIFIED Requirements

### Requirement: Cold-start fallback when no brand-voice examples exist
The system SHALL skip all few-shot retrieval (both `BrandVoiceExample` and `PlatformPost`) and generate using a generic, brand-neutral system prompt only when the requesting team has zero `BrandVoiceExample` documents **and no style pack resolved** for the request.

#### Scenario: Brand-new team with no submitted examples and no pack
- **WHEN** `team_id` has zero `BrandVoiceExample` documents and no style pack resolves (no request override, no team default, or the resolved reference is missing/inactive), regardless of how many `PlatformPost` documents the team has
- **THEN** the system generates content without any few-shot examples from either source, using the generic brand-neutral system prompt

#### Scenario: Team with at least one brand-voice example
- **WHEN** `team_id` has one or more `BrandVoiceExample` documents
- **THEN** the system performs retrieval from both `BrandVoiceExample` and `PlatformPost` as normal (each source independently empty-safe)

#### Scenario: Brand-new team with a resolved style pack is not brand-neutral
- **WHEN** `team_id` has zero `BrandVoiceExample` documents but a style pack resolves for the request
- **THEN** the system uses the styled prompt branch (pack card/examples), not the generic brand-neutral system prompt
