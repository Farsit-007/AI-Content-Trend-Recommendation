## ADDED Requirements

### Requirement: Layer 2b Routes Semantic Matches Through Two Bands

The ingestion pipeline's semantic-dedup layer (Layer 2b) SHALL NOT unconditionally drop candidates at or above the semantic threshold. Instead it SHALL route each candidate by its highest cosine similarity against the recent stored pool and in-run accepted items into one of three outcomes — accepted (below the semantic threshold), hard duplicate (at or above the calibrated hard-duplicate ceiling, dropped without an LLM call), or gray-band (adjudicated by the batched LLM judge) — and the layer's per-source `semantic_deduped` count SHALL equal fetched-minus-survivors so the layer-count invariant (fetched = drops + stored) continues to hold with the final survivors.

#### Scenario: Layer count balances with adjudication drops

- **WHEN** a run drops candidates via both the hard-duplicate band and `duplicate` verdicts
- **THEN** the sum of per-source `semantic_deduped` equals fetched-unique minus the items actually stored

#### Scenario: Recent pool exposes matchable fields

- **WHEN** Layer 2b builds the recent pool for a run
- **THEN** each pool entry carries its id, embedding, title, snippet, and publication time (and story fields when present) so the router can pick the nearest match and the service can corroborate it
