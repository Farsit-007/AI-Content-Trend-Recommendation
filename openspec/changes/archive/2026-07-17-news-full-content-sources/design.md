## Context

`INewsItem` (`backend/src/app/modules/NewsItem/newsItem.interface.ts:7`) has `snippet?: string` and no content field of any kind. `newsItemSchema` (`newsItem.model.ts:10,7,33`) has only a unique `content_hash` index and no `timestamps` option (the timestamp field is `created_at`). `RawNewsItem` (`NewsIngestion/newsIngestion.interface.ts:6`), the adapter output type, likewise has only `snippet?: string`.

Per-adapter snippet assignments today, all verified in code: gnews `article.description` (`gnews.ts:38`); reddit `post.selftext?.slice(0, 500)` (`reddit.ts:78`); devto `article.description` (`devto.ts:46`); producthunt `node.tagline` (`producthunt.ts:96`) — the GraphQL `QUERY` requests `id name tagline url votesCount commentsCount createdAt`, no `description` (`producthunt.ts:14-22`); stackoverflow `question.tags.join(', ')` (`stackoverflow.ts:47`) — `BASE_URL` has no `filter=` param, so no question body is ever returned (`stackoverflow.ts:6`); hackernews `stripHtml(hit.story_text)` (`hackerNews.ts:54`); github `repo.description` (`githubTrending.ts:111`); rss `item.contentSnippet` (`rss.ts:33`) — the parser is constructed as `new Parser({ timeout: 10_000 })` with no `customFields`, so `content:encoded` is never read (`rss.ts:10`); lobsters `buildSnippet` = description capped at 500 chars or tag join (`lobsters.ts:5,20-29`); mastodon `stripHtml(link.description)` (`mastodon.ts:47`).

The embedding input text is `` `${item.title} ${item.snippet ?? ''}` `` (`newsIngestion.utils.ts:56`) and must not change — the semantic-dedup cosine threshold (0.88) was calibrated against embeddings built from exactly this text.

The categorization prompt renders one line per item: `` `${id}. "${title}" — ${snippet ?? 'no snippet'} (relevance_score=…, trend_score=…)` `` (`newsIngestion.categorize.ts:41-46`) — untouched by this change (a follow-up change widens it once link-only content exists).

The pipeline's stored payload is assembled at one place (`newsIngestion.service.ts:223-245`) and inserted via `NewsItem.insertMany(payloads, { ordered: false })` (`newsIngestion.service.ts:247-259`). This is the single central point where the new content-capping/status logic belongs.

`GET /news-items` and `GET /news-items/:id` currently return `item.toObject()` spreads — the full document, including the 1536-float `embedding` array, ships to every client today (`newsItem.service.ts:35-46, 54-99`). `getAllNewsItems`'s `annotate` step computes `high_opportunity` from `plain.embedding` before any stripping could occur (`newsItem.service.ts:77-85`) — so response-side field removal must happen strictly after that computation.

## Goals / Non-Goals

**Goals:**
- Capture the fullest text each of six sources already returns (or one additional request parameter unlocks) in today's single existing request, with zero new HTTP calls.
- Give the data model a stable place (`content`, `content_status`, `word_count`, `content_fetched_at`) for that text, ready for later consumers (a follow-up extraction change, and generation's facts-then-write pipeline).
- Keep list-endpoint payloads light by dropping `embedding` (always) and `content` (list only) from API responses.

**Non-Goals:**
- Fetching the linked page for sources with no fuller API text (Mastodon, GNews, dev.to, GitHub, HN link posts, thin RSS feeds) — a separate follow-up change (`news-content-extraction`) adds a readability-extraction layer for those.
- Any change to `snippet` values, embedding input text, or content-hash identity.
- Widening the categorization prompt with content (deferred to the follow-up change, once link-only sources also have content).
- Backfilling existing stored rows — the 72-hour ingestion freshness window naturally rolls the working set over within days.

## Decisions

1. **`content_status` is a fixed, always-set vocabulary** (`none|partial|full|failed`), not inferred from string emptiness downstream. `none` = nothing beyond snippet (the default for every existing row and every source not upgraded here); `full` = complete text stored; `partial` = text stored but truncated by the char cap; `failed` is reserved for the follow-up extraction change (never set by this change) but included in the enum now so the schema doesn't need a second migration.
   - *Alternative considered*: infer status from `content` presence/length at read time. Rejected — an explicit, persisted status is unambiguous and lets a later "capped vs never-fetched" distinction exist without re-deriving it from string length heuristics.
2. **Cap applied centrally, once, in the pipeline payload assembly** — not per adapter. Adapters emit whatever raw text they have; one helper in `newsIngestion.service.ts` applies `NEWS_CONTENT_MAX_CHARS` (default 20000), sets `content_status` (`partial` if truncated, `full` otherwise, `none` if absent), and computes `word_count`.
   - *Alternative considered*: cap inside each adapter. Rejected — six call sites duplicating cap/status logic is a maintenance and consistency risk; one clamp site guarantees uniform behavior.
3. **Snippets are byte-for-byte frozen.** Every adapter keeps emitting the exact same `snippet` it does today. `content` is purely additive. This is non-negotiable: snippet feeds the embedding text, and changing it would silently shift the vector space underneath the calibrated semantic-dedup threshold — a much larger, unrelated blast radius than this change's stated scope.
4. **`rss-parser` gets explicit `customFields`**: `new Parser({ timeout: 10_000, customFields: { item: [['content:encoded', 'contentEncoded']] } })`. Relying on implicit namespaced-key passthrough is fragile across parser versions; declaring the field explicitly is documented, stable behavior. Feeds without a `content:encoded` element (most summary-only feeds) simply yield no content here — expected, and covered by the follow-up extraction change.
5. **Stack Overflow uses the API's own documented `filter=withbody`** appended to the existing single list request — no new request, no new auth flow. Product Hunt adds one field (`description`) to the existing GraphQL selection set — likewise zero new requests.
6. **API payload hygiene is a deliberate, immediate contract change with no current consumer impact.** No frontend page currently reads the news-item list/detail endpoints in a way that depends on `embedding` (the Feed UI does not exist yet — see the parent vision analysis). Stripping `embedding` from both endpoints and `content` from the list endpoint now avoids ever shipping a heavier contract that a real UI consumer would later depend on and be broken by.
7. **No migration/backfill.** All four new fields are optional with a schema default (`content_status: 'none'`); old rows read correctly with no data changes required.

## Risks / Trade-offs

- **[Risk] `rss-parser`'s `customFields` typing requires a cast or a local interface extension, since the library's default `Item` type doesn't know about `contentEncoded`.** → **Mitigation**: define a local `interface RssItemWithContent extends Parser.Item { contentEncoded?: string }` and cast the iterated item, keeping the rest of the file's typing strict.
- **[Risk] Some Stack Exchange questions may have very long HTML bodies (code blocks, images) that don't compress well to plain text.** → **Mitigation**: the central cap (decision 2) bounds this uniformly; `content_status: 'partial'` signals truncation to any downstream consumer without them needing to re-measure.
- **[Risk] Dropping `embedding`/`content` from list responses is a breaking response-shape change for any *future* client built against the old shape.** → **Mitigation**: no current client depends on it (verified — the Feed UI is unbuilt); this change ships before any UI is built against the endpoint, which is the cheapest possible time to make this change.
- **[Risk] Reddit is credential-gated and may return zero items in environments without `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, making the Reddit upgrade untestable live in some environments.** → **Mitigation**: unit tests use fixture data regardless of live credentials; live verification is opportunistic when the environment has Reddit configured.

## Migration Plan

- **Rollout**: code-only change to interfaces, model, six adapters, pipeline payload assembly, config, validation, docs, and the news-item service response shaping. Takes effect on next deploy/restart. No env var is required to opt in (the new `NEWS_CONTENT_MAX_CHARS` has a default); operators may tune it.
- **Rollback**: revert the changed files. No stored-data implications — new fields are additive and optional; no existing field's meaning changes.
- **Data**: no migration script, no backfill. Existing documents implicitly read as `content_status: 'none'` via the schema default.

## Open Questions

- Should `NEWS_CONTENT_MAX_CHARS` differ per source (e.g. Stack Overflow bodies vs. Lobsters descriptions tend to differ in typical length)? Left as a single global default for this change; revisit only if real ingested data shows one source's cap is poorly chosen.
