## ADDED Requirements

### Requirement: Instruction-Based Draft Refinement
`POST /content/refine` SHALL apply a short instruction to a provided text-format draft via a single uncached LLM call that preserves the draft's language and register and changes no more than instructed, returning the revised text. It SHALL enforce team access, accept only text formats (rejecting `youtube_idea`), and resolve language and style pack exactly as generation does — using the resolved style pack's card only, not its examples.

#### Scenario: Tweak chip refines a draft
- **WHEN** a member posts a Bangla `facebook_post` draft with instruction "make it shorter"
- **THEN** the response is a shorter Bangla revision of that draft, and no cache entries change

#### Scenario: Structured format rejected
- **WHEN** `format: "youtube_idea"` is sent to refine
- **THEN** the request fails validation with HTTP 400

#### Scenario: Foreign team rejected
- **WHEN** a user who is not a member of `team_id` (and not an admin) calls refine
- **THEN** the request is rejected with HTTP 403

#### Scenario: Oversized input rejected
- **WHEN** `current_text` exceeds 6000 characters or `instruction` exceeds 300 characters
- **THEN** the request fails validation with HTTP 400

#### Scenario: Style pack card informs the edit without re-injecting examples
- **WHEN** the team's resolved style pack has a `style_card`
- **THEN** the refine system prompt includes that card, but does not include the pack's example posts
