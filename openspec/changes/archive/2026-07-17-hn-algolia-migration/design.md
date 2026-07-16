## Context

`adapters/hackerNews.ts` currently drives 31 requests per run against the Firebase HN API (`topstories.json` + one `item/<id>.json` per story) to return 30 stories, and only ever sees the current front-page snapshot — a story that rises to prominence between two 3-hourly cron runs is invisible unless it happens to already be in the top 30 at snapshot time. This plan (`1-FARSIT-NEW-SOURCES-OPENSPEC-PLAN.md`) is adding several more adapters, so HN's request share needs to shrink, and Algolia's official HN Search API (`hn.algolia.com/api/v1`, 10k req/hr unauthenticated) delivers both a cheaper front page and a genuine trend-detection signal (a `points > 50` by-date query) in two total requests.

The adapter sits behind a static registry (`adapters/index.ts`) keyed by `source` string, and every stored item is identified downstream by `content_hash = sha256(source + ':' + url)` (`newsIngestion.utils.ts:14-15`). Every already-stored HN item was hashed under `source: 'hackernews'` and either its real submitted URL or the fallback `https://news.ycombinator.com/item?id=<id>`. This is the load-bearing constraint for the whole change: the migration must not touch the file's exported name, the registry entry, the `source` label, or the URL-derivation rule, or every previously stored HN item silently re-ingests as a duplicate on the next run.

## Goals / Non-Goals

**Goals:**
- Replace the Firebase fetch flow with two Algolia HN Search calls (front page + risers), merged and deduplicated by `objectID`.
- Preserve `content_hash` compatibility for every already-stored HN item — same `source`, same `source_id` format, same URL/fallback rule.
- Adopt the existing devto two-call "per-call catch, throw-only-if-both-fail" pattern so one Algolia endpoint failing doesn't kill the whole HN run.
- Reuse `htmlText.ts` (from the `lobsters-adapter` change) to strip `story_text` into `snippet`, instead of storing raw HTML.

**Non-Goals:**
- No change to the adapter registry, exported function name, config/env vars, or any frontend code — this is an internals-only rewrite of one file.
- No pagination of `search_by_date` beyond the single `hitsPerPage=50` page.
- No change to `content_hash` semantics, the `hackernews` source label, or `RawNewsItem`'s shape (explicit global constraint from the parent plan).

## Decisions

1. **Two queries, one adapter, dedupe by `objectID` via a `Map`.** Front page (`tags=front_page`, `hitsPerPage=30`) establishes the baseline; risers (`tags=story&numericFilters=points%3E50`, sorted by date, `hitsPerPage=50`) catches stories gaining traction between runs. Both are inserted into the same `Map<string, AlgoliaHit>` keyed by `objectID`; front-page insertion happens first and risers only fill in ids not already present, so a story present in both keeps the front-page copy's (more mature, more representative) engagement numbers. Alternative considered: last-write-wins with risers inserted second — rejected because risers query is sorted by date, not relevance, so its numbers can be less representative for a story also already on the front page.
2. **`numericFilters=points%3E50` must be percent-encoded explicitly** (`%3E` for `>`) in the constructed URL string rather than relying on `URLSearchParams` to encode a raw `>` correctly in all environments — this is a plain string constant, not built from user input, so a hardcoded pre-encoded literal removes any ambiguity.
3. **30/50 are file-local constants**, not env vars — mirrors today's `TOP_STORY_COUNT` and the parent plan's explicit "don't add an env var for a single credential-free adapter's tuning constant" convention (established by the `lobsters-adapter` change).
4. **`created_at_i` (Algolia's epoch-seconds field) is authoritative for `published_at`**, not the also-present ISO `created_at` string — avoids any local-timezone parsing ambiguity and matches the pipeline-wide UTC/epoch convention (`newsIngestion.utils.ts` baseline rule).
5. **Failure handling mirrors devto's two-call pattern**: each Algolia call is wrapped in its own try/catch returning `null` on failure (logged); the two result sets are merged; the adapter throws only when *both* calls returned `null`. A single endpoint failure degrades to partial results instead of an empty run.
6. **URL/identity mapping is copied verbatim from the old adapter's logic**, not reinvented: `url: hit.url ?? 'https://news.ycombinator.com/item?id=' + hit.objectID'`, `source_id: String(hit.objectID)`. This is the one piece of the rewrite where "clean it up" instinct is deliberately suppressed — any deviation breaks hash compatibility.
7. **Snippet uses the shared `htmlText.ts` helper** (`stripHtml`) on `story_text` rather than inlining a strip regex — `story_text` is HTML (same as Lobsters' `description`), and the helper already exists in-repo from the `lobsters-adapter` change, so this avoids a second implementation of the same stripping logic.

## Risks / Trade-offs

- **[Risk] Hash divergence silently duplicates the entire HN backlog** if the URL fallback format, `source` label, or `source_id` stringification differs even slightly from the old adapter → **Mitigation**: a dedicated hash-compatibility unit test (`computeContentHash('hackernews', <mapped url>)` equated against the old mapping rules, with and without `hit.url` present) plus the verification step's explicit post-migration `hash_deduped`-should-be-high check called out in the parent plan; this is the primary gate before archiving.
- **[Risk] Algolia's unofficial-adjacent status** (it's the official HN search backend but not a formally SLA'd API) could degrade or rate-limit unexpectedly → **Mitigation**: the per-call catch means a transient Algolia outage degrades to partial or (both down) an honest thrown error surfaced in run history, not a silent empty success; 10k req/hr budget is ~240,000x today's actual usage (2 req/run × 8 runs/day), so steady-state throttling is not a realistic concern.
- **[Risk] `search_by_date` risers query returning up to 50 items plus 30 front-page items raises HN's per-run fetched volume** (previously a fixed 30) → **Mitigation**: still within the parent plan's ≤400-items/run total cost guardrail (documented in the parent plan's Definition of Done); the risers query intersects heavily with the front page in practice, so actual net-new volume is expected to be well under the 50 cap.

## Migration Plan

- Single-file rewrite behind the existing registry entry — no separate rollout step; the next scheduled or manual ingestion run after deploy uses the new code path automatically.
- **Rollback**: revert the commit / restore the previous `hackerNews.ts` contents. Because both old and new code paths produce hash-compatible items, a rollback after a run or two causes no data damage — it simply reverts to 31 requests/run.
- **Smoke check (per parent plan, non-optional)**: the first post-deploy run's `hackernews` row in `GET /api/v1/news-items/ingestion-runs` must show high `hash_deduped` relative to `fetched` (front-page stories already in the DB deduping correctly) and `stored` clearly below `fetched` — if instead nearly everything fetched gets `stored`, hashes have diverged and the change must be fixed before the next cron fires.

## Open Questions

None — the identity-preservation contract, endpoint shapes, and failure pattern are all fully specified by the parent plan and existing adapter conventions (devto merge pattern, reddit throw pattern).
