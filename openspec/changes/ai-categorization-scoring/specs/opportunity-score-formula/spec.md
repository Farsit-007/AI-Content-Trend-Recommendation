## ADDED Requirements

### Requirement: Opportunity score is computed from relevance, trend, and audience fit
The pipeline SHALL compute each item's `opportunity_score` as a deterministic, configurably-weighted combination of `relevance_score`, `trend_score`, and a new `audience_fit` value (0-1) supplied by the categorization LLM call, rather than accepting an opportunity score chosen directly by the LLM.

#### Scenario: All three signals available
- **WHEN** an item has a numeric `relevance_score`, a numeric `trend_score`, and the LLM returns a valid `audience_fit` between 0 and 1
- **THEN** `opportunity_score` is computed as `W_RELEVANCE * relevance_score + W_TREND * trend_score + W_FIT * (audience_fit * 10)`, rounded to one decimal, using the configured weights

#### Scenario: Relevance score unavailable (cold start)
- **WHEN** the brand-voice pool is empty so `relevance_score` is `undefined` for an item
- **THEN** the formula substitutes the configured fallback relevance value in place of `relevance_score` when computing `opportunity_score`

### Requirement: Categorization LLM contract replaces opportunity_score with audience_fit
The categorization LLM response schema SHALL request `audience_fit` (0-1, describing topical fit independent of trend/relevance) instead of a directly-assigned `opportunity_score`.

#### Scenario: LLM returns a valid audience_fit
- **WHEN** the categorization LLM call returns a parseable response with `audience_fit` as a number between 0 and 1 for an item
- **THEN** that value is used as the `audience_fit` input to the opportunity score formula

#### Scenario: LLM response is missing or invalid audience_fit
- **WHEN** the categorization LLM call returns a response where `audience_fit` is missing, non-numeric, or outside the 0-1 range for an item
- **THEN** that item falls back to deriving `audience_fit` from `relevance_score` alone, consistent with the pipeline's existing fallback behavior on parse/validation failure

### Requirement: Formula weights are configurable
The weights `W_RELEVANCE`, `W_TREND`, and `W_FIT` used in the opportunity score formula SHALL be read from configuration rather than hardcoded inline, and SHALL sum to 1.

#### Scenario: Weights are read from config
- **WHEN** the pipeline computes `opportunity_score` for any item
- **THEN** it uses the weight values from `config.news_ingestion` rather than literal constants in the scoring function
