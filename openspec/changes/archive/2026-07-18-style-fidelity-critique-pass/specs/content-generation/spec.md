## ADDED Requirements

### Requirement: Optional Critique-and-Rewrite Pass
When `CONTENT_CRITIQUE_ENABLED` is true, a style pack is resolved for the request, and the format is
both text-kind and included in `CONTENT_CRITIQUE_FORMATS`, generation SHALL run a second model pass
that minimally rewrites AI-sounding sentences in the first-pass draft, guided by the resolved style
pack's card, while preserving the draft's facts, language, approximate length, and structure. The
pass SHALL be skipped for JSON-kind formats, for generations with no resolved style pack, and for
`POST /content/refine`. Any critique-call error or a result failing the degenerate-output guards
(empty, outside the length band, or excessive script-ratio drift for Bangla) SHALL be discarded,
keeping the first-pass draft, without failing the request. The pass SHALL complete before the
result is cached, so a cache hit never re-runs it.

#### Scenario: Flag disabled is byte-identical to today
- **WHEN** `CONTENT_CRITIQUE_ENABLED` is false
- **THEN** generation makes no critique call and produces output identical to the pre-existing behavior

#### Scenario: Enabled critique improves a flagged format with a resolved pack
- **WHEN** critique is enabled, `facebook_post` is in `CONTENT_CRITIQUE_FORMATS`, and a style pack resolves for the request
- **THEN** exactly one additional model call is made for that format, and the cached/returned text is the critique pass's output when it passes the guards

#### Scenario: No style pack skips the pass entirely
- **WHEN** critique is enabled but no style pack resolves for the request
- **THEN** no critique call is made and the first-pass draft is returned unchanged

#### Scenario: JSON-kind format is exempt
- **WHEN** critique is enabled and `youtube_idea` is requested
- **THEN** no critique call is made for that format regardless of configuration

#### Scenario: Refine is exempt
- **WHEN** `CONTENT_CRITIQUE_ENABLED` is true
- **THEN** `POST /content/refine` behavior and call count are unaffected by the flag

#### Scenario: Degenerate critique output is discarded
- **WHEN** the critique call returns text more than 1.6x the length of the draft
- **THEN** the first-pass draft is returned and cached, and a warning is logged; the request does not fail

#### Scenario: Cached results never re-run the pass
- **WHEN** a second identical request hits the cache for a previously critiqued format
- **THEN** no critique call occurs on the cache hit

## MODIFIED Requirements

### Requirement: Bangla Quality Bake-off Harness
The system SHALL provide an offline harness that generates content for a configurable matrix of
candidate models, topics, and formats through the production prompt path (style pack retrieval,
brand voice, facts grounding, format instructions identical to serving), recording every output with
full parameters and emitting a blinded, shuffled reviewer document with a fixed scoring rubric. The
harness SHALL NOT alter serving configuration, SHALL cap matrix size, SHALL run serially with
rate-limit tolerance, and SHALL record per-cell failures without aborting. The harness SHALL support
an optional paired-comparison mode that, for each matrix cell, additionally generates a critiqued
variant via the same critique-and-rewrite pass available in live generation, emitting the critiqued
and non-critiqued variants as independently labeled, independently shuffled samples so blinding is
not compromised by visible pairing.

#### Scenario: Blinded review file
- **WHEN** the harness runs with 3 models and 4 topics for 2 formats
- **THEN** the review markdown contains 24 samples in shuffled order labeled without model identity, and the JSON output maps labels to models, prompts, and parameters

#### Scenario: Production-path fidelity
- **WHEN** a harness generation and a live `POST /content/generate` run with the same team, pack, topic, and format
- **THEN** their system and user prompts are identical

#### Scenario: Paired critique comparison stays independently blinded
- **WHEN** the harness runs with `--critique both` for 2 models, 2 topics, and 1 format
- **THEN** the run produces 8 cells (4 non-critiqued, 4 critiqued), and the review document's shuffled sample order does not place any critiqued/non-critiqued pair in adjacent or otherwise identifiable positions by construction (each cell is shuffled independently among all cells, not paired)
