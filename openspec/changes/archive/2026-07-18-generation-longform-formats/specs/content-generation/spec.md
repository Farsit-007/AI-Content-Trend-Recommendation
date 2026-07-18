## MODIFIED Requirements

### Requirement: Generate multi-format content from a topic
The system SHALL provide `POST /content/generate`, accepting `{ team_id: string, topic: string, news_item_id?: string, language?: LanguageStyle, style_pack_id?: string, formats?: FormatId[] }`, and SHALL return a JSON object containing `topic` plus exactly the requested formats (each a string for text-kind formats, or the structured `youtube_idea` object for that format). `formats` SHALL be a non-empty, unique subset of at most 5 of `facebook_post`, `linkedin_post`, `facebook_reel_script`, `youtube_idea`, `caption`, defaulting to `["facebook_post", "linkedin_post"]` when omitted.

#### Scenario: Successful generation with a plain topic
- **WHEN** an authenticated user belonging to `team_id` submits `{ team_id, topic }` with no `news_item_id` and no `formats`
- **THEN** the system embeds the topic, retrieves the team's few-shot examples, makes exactly two format LLM calls (`facebook_post`, `linkedin_post`), and returns `{ topic, facebook_post, linkedin_post }` with both populated

#### Scenario: Missing or invalid required fields
- **WHEN** the request omits `team_id` or `topic`, or `topic` is empty
- **THEN** the system responds with a validation error and does not call the LLM

#### Scenario: Invalid formats value rejected
- **WHEN** `formats` contains an unknown value, is empty, contains duplicates, or exceeds 5 entries
- **THEN** the request fails validation with HTTP 400 and no LLM call is made

#### Scenario: Explicit formats subset shapes the response
- **WHEN** a request specifies `formats: ["caption"]`
- **THEN** the response contains exactly `{ topic, caption }` — no other format keys are present

### Requirement: Single structured generation call with strict validation
The system SHALL make one LLM call per requested format (not one call for all formats), each carrying a format-specific system-prompt suffix with length/structure directives: Facebook post 150-400 words opening with a hook line; LinkedIn post 1,200-2,500 characters with paragraph breaks and 3-5 hashtags; caption at most 200 characters; reel script in scene/voice-over structure; YouTube idea as the existing structured `{title, hook, chapters[], thumbnail_concept}` object. Text-kind formats (all except `youtube_idea`) SHALL be requested and parsed as plain text — stripped of any markdown fences and trimmed, with no JSON parsing step — while `youtube_idea` alone SHALL use a strict JSON contract with shape validation, matching the request/error semantics of the system's prior single-call validation (an invalid or unparseable result is a hard failure, never partial or fabricated content). Text-format system prompts SHALL include fixed anti-AI-tell style instructions (varied sentence length, concrete hooks, no formulaic closers, no overuse of em-dashes/bullets in prose). If any requested format's call fails (LLM error, or its parsed result is empty/invalid), the request SHALL fail as a whole with no partial response and no cache writes for that request's misses.

#### Scenario: Length directives reach the model
- **WHEN** a `linkedin_post` is generated
- **THEN** that call's system prompt contains the 1,200-2,500-character directive, and a separately-requested `facebook_post` call's prompt contains the 150-400-word directive

#### Scenario: Long Bangla output survives parsing
- **WHEN** a text-format call returns a long plain-text Bangla post with no JSON wrapper
- **THEN** it is accepted verbatim (fences/whitespace trimmed), with no JSON parse step that could fail on it

#### Scenario: Anti-AI-tell instructions present for text formats only
- **WHEN** `facebook_post` and `youtube_idea` are both requested in one call
- **THEN** the `facebook_post` call's system prompt contains the anti-AI-tell instructions and the `youtube_idea` call's system prompt does not

#### Scenario: One failing format fails the whole request
- **WHEN** two formats are requested and one format's LLM call throws or returns unparseable output
- **THEN** the request responds with HTTP 502 and no formats are cached from this request's misses
