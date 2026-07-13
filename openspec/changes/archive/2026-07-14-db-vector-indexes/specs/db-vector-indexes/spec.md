## ADDED Requirements

### Requirement: news_items collection schema
The backend SHALL expose a Mongoose model for `news_items` with fields for source identity (`source`, `source_id`, `content_hash`), content (`title`, `url`, `snippet`, `published_at`), engagement metrics, `trend_score`, AI-derived fields (`category`, `relevance_score`, `impact_note`, optional/nullable), a 1536-dimension `embedding` array, `opportunity_score`, `processed`, and `created_at`.

#### Scenario: NewsItem model is importable
- **WHEN** another backend module imports `backend/src/app/models/NewsItem.ts`
- **THEN** it SHALL receive a typed Mongoose model whose schema matches `project-ida-requirments.md` §5.8's `news_items` shape, with `embedding` typed as a 1536-length number array

#### Scenario: content_hash uniqueness enforced
- **WHEN** two `news_items` documents are inserted with the same `content_hash`
- **THEN** the second insert SHALL fail a unique-index constraint at the database level

### Requirement: brand_voice_examples collection schema
The backend SHALL expose a Mongoose model for `brand_voice_examples` with `platform`, `category`, `content`, a 1536-dimension `embedding` array, `engagement_hint`, `added_by`, and `created_at`.

#### Scenario: BrandVoiceExample model is importable
- **WHEN** another backend module imports `backend/src/app/models/BrandVoiceExample.ts`
- **THEN** it SHALL receive a typed Mongoose model whose schema matches `project-ida-requirments.md` §5.8's `brand_voice_examples` shape, with `embedding` typed as a 1536-length number array

### Requirement: platform_posts collection schema
The backend SHALL expose a Mongoose model for `platform_posts` — a standalone collection (distinct from the aggregate `platform_analytics` collection) storing individual platform posts with `platform`, `post_id`, `content_snippet`, a 1536-dimension `embedding` array, `metrics` (reach/likes/comments/shares/views), `published_at`, and `fetched_at`.

#### Scenario: PlatformPost model is importable
- **WHEN** another backend module imports `backend/src/app/models/PlatformPost.ts`
- **THEN** it SHALL receive a typed Mongoose model targeting the `platform_posts` collection, with `embedding` typed as a 1536-length number array

#### Scenario: platform + post_id uniqueness enforced
- **WHEN** two `platform_posts` documents are inserted with the same `platform` and `post_id`
- **THEN** the second insert SHALL fail a compound unique-index constraint at the database level

### Requirement: Atlas Vector Search indexes at 1536 dimensions, cosine similarity
The backend SHALL provide 3 Atlas Vector Search indexes — `news_items_vector_index`, `brand_voice_vector_index`, `platform_posts_vector_index` — each targeting the `embedding` field of its respective collection with `numDimensions: 1536` and `similarity: cosine`. None SHALL use the requirements doc's stale 768-dimension assumption.

#### Scenario: Index definitions specify 1536 dimensions
- **WHEN** the index creation script's definitions are inspected
- **THEN** all 3 SHALL declare `numDimensions: 1536` and `similarity: "cosine"`, matching the verified `openai/text-embedding-3-small` output

#### Scenario: Indexes are created idempotently
- **WHEN** the index creation script is run against a cluster where the indexes already exist
- **THEN** it SHALL detect existing indexes via `listSearchIndexes` and skip re-creation without erroring

#### Scenario: Indexes are created against a fresh cluster
- **WHEN** the index creation script is run against a cluster with the 3 target collections but no Search indexes
- **THEN** it SHALL create all 3 indexes and each SHALL eventually reach `READY` status

### Requirement: Live verification of vector query correctness
The backend SHALL provide a verification script that confirms each of the 3 vector indexes returns non-empty, error-free results for a real `$vectorSearch` query using a live-embedded vector, not just that the index exists.

#### Scenario: Verification passes against a healthy index
- **WHEN** the verification script runs against a cluster where all 3 indexes are `READY` and each collection has at least one seeded document
- **THEN** each `$vectorSearch` query SHALL return without error and the script SHALL report success per collection

#### Scenario: Verification surfaces a dimension mismatch
- **WHEN** an index was created with the wrong `numDimensions` (e.g. the requirements doc's stale 768)
- **THEN** the verification script's query SHALL fail or return zero results, and the script SHALL report this as a failure rather than silently passing
