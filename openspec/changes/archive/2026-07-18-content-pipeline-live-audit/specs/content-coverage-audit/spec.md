## ADDED Requirements

### Requirement: Per-source content_status coverage report
The system SHALL provide a read-only script that reports, for every distinct `source` value present in the
`news_items` collection, the count and percentage of documents at each `content_status`
(`none`/`partial`/`full`/`failed`).

#### Scenario: Multiple sources with mixed content_status values
- **WHEN** the audit script is run against a `news_items` collection containing documents from several sources,
  each with a mix of `content_status` values
- **THEN** the report SHALL show, per source, the count and percentage of documents at each `content_status`
  value present for that source

#### Scenario: A source with no items at a given content_status
- **WHEN** a source has zero documents at a particular `content_status` (e.g. no `failed` items)
- **THEN** that `content_status` SHALL be omitted or shown as zero for that source, not fabricated or omitted
  entirely from the source's row

### Requirement: Average word_count per source
The system SHALL report the average `word_count` per source, computed only over documents where `word_count`
is present, and SHALL label the figure to make clear it excludes documents without a `word_count`.

#### Scenario: Source with a mix of scored and unscored documents
- **WHEN** a source has some documents with `word_count` set and some without (e.g. `content_status: none`)
- **THEN** the reported average SHALL reflect only the documents where `word_count` is present, and the output
  label SHALL indicate this exclusion

### Requirement: Sample of thin/failed items for manual spot-checking
The system SHALL output a bounded sample (title + url + source) of documents whose `content_status` is `none`
or `failed`, for manual spot-checking.

#### Scenario: More than the sample limit of failed/none items exist
- **WHEN** the collection contains more `none`/`failed` documents than the script's sample limit
- **THEN** the script SHALL return only up to the limit, not the full set, and SHALL NOT error or hang

#### Scenario: No failed/none items exist
- **WHEN** every document in the collection has `content_status` of `partial` or `full`
- **THEN** the script SHALL report an empty sample without error

### Requirement: Read-only, safe to run against production data
The audit script SHALL perform only read (`find`/aggregation) operations against `news_items` and SHALL NOT
write, update, or delete any document.

#### Scenario: Script run against the live production database
- **WHEN** the script is executed against the real deployment's `news_items` collection
- **THEN** no document in the collection SHALL be modified, and the script SHALL exit cleanly after printing
  its report
