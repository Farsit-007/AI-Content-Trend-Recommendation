## ADDED Requirements

### Requirement: Dedup Calibration Harness With Labeled Pair Set

The repository SHALL provide a live calibration harness (extending the existing semantic-dedup verify script) with a committed, hand-labeled pair set covering true duplicates, progressive updates (including status reversals), and same-topic-distinct pairs. The harness SHALL measure per-class embedding similarity distributions against the configured embedding model, propose the hard-duplicate ceiling from the update class's maximum, and measure the adjudication prompt's verdict accuracy per class with the standard LLM. The original three-item regression (cross-source duplicate collapse, engagement tie-break, distinct survival) SHALL remain runnable and passing.

#### Scenario: Threshold proposal from measured distributions

- **WHEN** the harness runs in calibrate mode
- **THEN** it prints per-class similarity min/median/max and a proposed hard-dup ceiling derived from the update class's maximum plus a margin

#### Scenario: Judge accuracy report

- **WHEN** the harness runs in judge mode
- **THEN** it prints a confusion matrix over the gray-band pairs and pass/fail against the ≥ 90 % duplicate / ≥ 95 % update bars

#### Scenario: Legacy regression preserved

- **WHEN** the harness runs in its default mode
- **THEN** the original near-duplicate-collapse and distinct-survival checks still execute and pass
