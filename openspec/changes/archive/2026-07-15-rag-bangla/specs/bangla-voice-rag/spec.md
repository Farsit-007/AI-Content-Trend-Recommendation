## ADDED Requirements

### Requirement: Brand voice seed script loads real posts idempotently
The system SHALL provide `npm run seed:brand-voice -- <team_id> <file.json>` that reads a JSON array of `{ platform, category?, content, engagement_hint? }` objects, embeds each via `lib/embeddings.ts`, and upserts into `brand_voice_examples` for the given team. Re-running the script with the same file SHALL skip items whose exact content already exists for that team.

#### Scenario: Successful seed run
- **WHEN** the script is run with a valid team id and a JSON file containing 3 new posts
- **THEN** 3 `BrandVoiceExample` documents are created with embeddings, and the script logs the count of created vs skipped

#### Scenario: Idempotent re-run
- **WHEN** the same seed file is run a second time against the same team
- **THEN** all items are skipped and the total count stays unchanged

#### Scenario: Less than 25 examples
- **WHEN** the seed completes and the team has fewer than 25 total examples
- **THEN** the script logs a tip recommending 25–30 examples for reliable voice matching

### Requirement: Content generation respects team default language
The system SHALL resolve the output language for `POST /content/generate` in this order: (1) request-level `language` field if provided, (2) `team.voice_profile.default_language`, (3) `'bangla'` as the global default. The resolved language SHALL be emitted as an explicit instruction in the system prompt.

#### Scenario: Per-request language override
- **WHEN** a generate request includes `language: 'english'` for a team whose `voice_profile.default_language` is `'bangla'`
- **THEN** the generated content is written in English, not Bangla

#### Scenario: Team default language used when no override
- **WHEN** a generate request omits `language` and the team has `voice_profile.default_language: 'bangla'`
- **THEN** the system prompt contains the Bangla writing instruction

#### Scenario: Cold-start team without brand voice examples
- **WHEN** a team has zero brand voice examples
- **THEN** content is generated in a brand-neutral tone but still in the resolved language

### Requirement: Chat respects team default language and per-request override
The chat endpoint SHALL resolve language identically to content generation (request override → team default → 'bangla') and include the same language instruction in the system prompt.

#### Scenario: Chat reply in team's default language
- **WHEN** a chat request omits `language` and team default is `'bangla'`
- **THEN** the assistant reply contains Bengali script (or Banglish, per team setting)

#### Scenario: Language override in single chat message
- **WHEN** a chat request includes `language: 'english'`
- **THEN** the assistant replies in English regardless of team default

### Requirement: Team custom instructions are appended to every prompt
The `team.voice_profile.custom_instructions` field (max 500 chars) SHALL be appended to the system prompt in both content generation and chat calls. If empty or absent it SHALL be omitted.

#### Scenario: Custom instructions present
- **WHEN** a team has `custom_instructions: "always end with a question"` and content is generated
- **THEN** the system prompt contains that instruction text

#### Scenario: No custom instructions
- **WHEN** a team has no `custom_instructions`
- **THEN** no custom instructions line appears in the system prompt

### Requirement: Example seed file exists for team onboarding
The repository SHALL include `seed/brand-voice.example.json` showing the expected JSON structure with 3–5 sample entries so teams can copy-edit and run the seed script without reading source code.

#### Scenario: Example file is valid per seed schema
- **WHEN** the example file is passed to `seed:brand-voice`
- **THEN** the script parses and processes it without schema errors
