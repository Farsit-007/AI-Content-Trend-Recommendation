## MODIFIED Requirements

### Requirement: Hacker News Source via Algolia With Hash-Compatible Identity
The Hacker News adapter SHALL fetch the current front page and recent
high-scoring stories (points > 50, by date) from the official Algolia HN API in
two requests total, merged and deduplicated by story id. Emitted items SHALL be
identity-compatible with items ingested by the previous Firebase-based adapter:
`source` remains `hackernews`, `source_id` remains the HN item id, and the item
URL remains the story's submitted URL, falling back to
`https://news.ycombinator.com/item?id=<id>` for stories without one — so that
`content_hash` values are unchanged across the migration. The adapter SHALL
degrade to partial results when only one of the two Algolia queries fails, and
SHALL throw only when both fail.

#### Scenario: Front page fetched in one request
- **WHEN** the adapter runs
- **THEN** it issues exactly one `search?tags=front_page` request and one `search_by_date?tags=story&numericFilters=points>50` request, and a story present in both responses appears once in the output

#### Scenario: Hash compatibility with previously stored items
- **WHEN** a story that the old Firebase adapter already stored reappears via Algolia
- **THEN** its computed `content_hash` is identical to the stored one and the item is hash-deduped, not re-ingested

#### Scenario: URL-less story fallback
- **WHEN** a fetched story has no `url` field
- **THEN** the item URL is `https://news.ycombinator.com/item?id=<objectID>`

#### Scenario: One Algolia query fails
- **WHEN** the front-page request fails but the risers request succeeds
- **THEN** the adapter logs the failure and returns the risers' items instead of throwing

#### Scenario: Both Algolia queries fail
- **WHEN** both the front-page and risers requests fail
- **THEN** the adapter throws, and the run history records the error for source `hackernews`
