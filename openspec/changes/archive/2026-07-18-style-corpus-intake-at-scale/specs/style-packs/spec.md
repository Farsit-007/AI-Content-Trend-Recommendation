## ADDED Requirements

### Requirement: Bulk Example Import
super_admins SHALL be able to import up to 100 style examples for a pack in one request, using the same
item shape (`content`, optional `platform`, optional `source_ref`, optional `engagement_hint`) as the
existing single-example-add endpoint and the seed-file format. The system SHALL embed the batch's surviving
items in a single embeddings call, SHALL skip items whose whitespace-normalized content already matches an
existing example in the pack or an earlier item in the same batch, and SHALL report the number created and
skipped. A batch exceeding 100 items or containing an invalid item SHALL be rejected in full with a
validation error, creating nothing.

#### Scenario: Mixed batch imports cleanly
- **WHEN** a super_admin posts 40 items to a pack's bulk-import endpoint, of which 5 duplicate existing examples after whitespace normalization and 2 duplicate each other within the batch
- **THEN** 34 examples are created with server-generated embeddings, the response reports `{ created: 34, skipped: 6, total: 34 }`, and exactly one embeddings request was made for the batch

#### Scenario: Re-importing the same batch is idempotent
- **WHEN** the same 40-item batch from a prior successful import is submitted again
- **THEN** all 40 items are reported skipped and no new examples are created

#### Scenario: Oversized batch rejected
- **WHEN** a super_admin submits a batch of 101 items
- **THEN** the request is rejected with a validation error and no examples are created

#### Scenario: Non-super_admin cannot bulk import
- **WHEN** an admin or regular user calls the bulk-import endpoint
- **THEN** the request is rejected with HTTP 403

### Requirement: Style Card Generation and Freshness Metadata
The system SHALL allow a super_admin to trigger style-card generation for a pack via an API endpoint that
uses the same generation logic as the existing CLI script, and SHALL persist when the card was generated and
from how many examples. Pack reads SHALL include this metadata alongside the card text so a client can
determine whether the card is stale relative to the pack's current example count, without the system storing
a separate stale/fresh flag.

#### Scenario: Generating a card records freshness metadata
- **WHEN** a super_admin triggers card generation for a pack holding 50 examples
- **THEN** the pack's `style_card` is set, `style_card_generated_at` is set to the generation time, and `style_card_example_count` is set to 50

#### Scenario: Regenerating a card overwrites prior metadata
- **WHEN** a super_admin triggers card generation again for a pack whose example count has changed since the last generation
- **THEN** the card text, `style_card_generated_at`, and `style_card_example_count` are all overwritten to reflect the current run

#### Scenario: Cannot generate a card for an empty pack
- **WHEN** card generation is triggered for a pack with zero examples
- **THEN** the request fails with a client error and the pack's existing card metadata (if any) is unchanged

#### Scenario: Non-super_admin cannot trigger card generation
- **WHEN** an admin or regular user calls the card-generation endpoint
- **THEN** the request is rejected with HTTP 403

#### Scenario: Staleness is derivable from pack reads
- **WHEN** a pack has 55 examples and `style_card_example_count: 50` from a prior generation
- **THEN** a client reading the pack can determine the card is stale by comparing the two counts, without a separate stale flag being present in the response
