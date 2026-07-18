## ADDED Requirements

### Requirement: Platform-Matched Style Retrieval
When a style pack is active for a generation request, retrieval of that pack's few-shot examples for
each requested format SHALL prefer examples whose `platform` matches the format's preferred platform
(Facebook-family formats prefer `facebook`, `linkedin_post` prefers `linkedin`), ranked by topic
similarity among matches first. When fewer matching examples exist than the retrieval limit, the
selection SHALL be backfilled with the pack's remaining examples ranked by topic similarity, up to
the same limit. Formats with no preferred platform, and packs where no example carries a matching
platform tag, SHALL produce a selection identical to plain topic-similarity ranking. The pack's
examples SHALL be fetched from storage at most once per generation request regardless of how many
formats are requested.

#### Scenario: LinkedIn generation prefers linkedin-tagged examples
- **WHEN** a resolved pack holds 10 `facebook`-tagged and 3 `linkedin`-tagged examples and `linkedin_post` is generated
- **THEN** the prompt's style examples lead with the 3 `linkedin`-tagged examples in similarity order, backfilled up to the retrieval limit with the highest-similarity remaining examples

#### Scenario: Facebook-family formats prefer facebook-tagged examples
- **WHEN** the same pack from the prior scenario generates `facebook_post` in the same request
- **THEN** its style examples are selected from the `facebook`-tagged examples first, distinct from the `linkedin_post` call's selection

#### Scenario: Untagged corpus degrades to pure similarity
- **WHEN** every example in a resolved pack has platform `other` (or no platform value)
- **THEN** the selected style examples for any format are identical to ranking by topic similarity alone, with no scenario-visible difference from behavior prior to this requirement

#### Scenario: Format with no platform preference is unaffected
- **WHEN** `youtube_idea` is generated with a resolved pack active
- **THEN** its style examples are selected by topic similarity alone, regardless of any platform tags present in the pack

#### Scenario: One fetch serves every requested format
- **WHEN** a single generation request asks for both `facebook_post` and `linkedin_post` with a resolved pack
- **THEN** the pack's examples are read from storage exactly once for the request, with per-format selection computed from that one read
