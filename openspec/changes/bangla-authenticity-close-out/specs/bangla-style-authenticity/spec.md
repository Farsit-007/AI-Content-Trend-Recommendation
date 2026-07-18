# bangla-style-authenticity

## ADDED Requirements

### Requirement: Launch style packs contain real writer corpora
Each launch style pack SHALL contain at least 30 real, public posts from the target writer/page
(not AI-fabricated imitations), each with `source_ref` set to the public post URL, and SHALL have a
generated `style_card` distilled from that corpus.

#### Scenario: Pack readiness check
- **WHEN** a style pack is marked as a launch pack
- **THEN** it has ≥30 examples with non-empty `source_ref` and a non-empty `style_card`

### Requirement: Gate G1 retrieval verdict is recorded before topic-summary embeddings are enabled
`STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` SHALL remain false unless a recorded Gate G1 run (real pack,
related and unrelated topic queries, eyeballed rankings) concludes raw-content retrieval is
inadequate.

#### Scenario: G1 passes
- **WHEN** related topics retrieve on-topic examples and unrelated topics rank low in the G1 check
- **THEN** the verdict is recorded (date, pack, outcome) and the flag stays false

### Requirement: Gate G3 bake-off decides the content model and critique pass
A blinded bake-off (rubric and process per `BANGLA-QUALITY-DECISION.md`) SHALL be run against a
real Track-0 pack with `--critique both`, scored by at least one native Bangla reviewer, and its
outcomes SHALL be recorded in that document's decision tables. The winning model SHALL be applied
as the `content_generation` task default via the admin LLM settings, and
`CONTENT_CRITIQUE_ENABLED` SHALL be set per the documented thresholds.

#### Scenario: Bake-off completes
- **WHEN** scoring finishes and the label map is revealed
- **THEN** both decision tables in `BANGLA-QUALITY-DECISION.md` have a filled row and the task
  default in the LLM settings matches the recorded choice

### Requirement: Requested output language always wins over style material
Generated and refined content SHALL be produced in the requested (or team-default) language even
when the active style pack, style card, or few-shot examples are written in a different language.
Generation and refine each enforce this through their own distinct mechanism: the generation
system prompt MUST contain an explicit language-dominance clause whenever style or few-shot blocks
are present; the refine system prompt MUST contain an explicit instruction to preserve the
original draft's language and register regardless of any style card supplied alongside it.

#### Scenario: English request against a Bangla pack (generation)
- **WHEN** messages are built via `buildMessages`/`buildSystemPrompt` with `language: 'english'`
  and a Bangla style pack with examples
- **THEN** the system prompt contains the English language instruction and the dominance clause
  stating style material defines tone only

#### Scenario: Refine preserves draft language even with a style card present
- **WHEN** refine messages are built via `buildRefineMessages` for a Bangla draft with a style
  card supplied
- **THEN** the system prompt instructs preserving the draft's existing language, register, and
  factual claims, independent of the style card's own language
