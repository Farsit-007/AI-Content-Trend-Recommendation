## Context

All ingestion code lives in `backend/src/app/modules/NewsIngestion/`. `runIngestionPipeline()` runs four layers (fetch/normalize → hash-dedup + freshness → semantic dedup → relevance/trend → categorize/store) on a 3-hourly cron (`backend/src/app/lib/scheduler.ts:13-24`) and via `POST /api/v1/news-items/ingest` (`newsItem.route.ts:12`).

Verified current state (re-checked against the code on 2026-07-16):

| Fact | Location |
|---|---|
| Config schema lives at `backend/src/app/config/index.ts` — **not** `backend/src/config/index.ts`, which an earlier archived proposal cited in error | `app/config/index.ts` |
| `NEWS_INGESTION_RSS_FEEDS` is optional, parsed as a comma-separated list, and set in neither `.env` nor `.env.example` | `config/index.ts:70`, `:181-184` |
| dev.to fetches `?top=7` (top of the last 7 days); `filterFresh` drops anything older than 72 h | `adapters/devto.ts:14`; `newsIngestion.utils.ts:21-24` |
| `content_hash = sha256(`source`:`url`)` — the source label is part of the hash input | `newsIngestion.utils.ts:14-15` |
| Summary sources come from adapter names only: `adapterResults.map(r => r.source)` | `newsIngestion.service.ts:36`, `:127-134` |
| `NewsItem.source` is an unconstrained `String` (no enum) | `newsItem.model.ts:5` |
| No frontend component reads `NewsItem.source` (verified by grep) | `frontend/src/` |

## Goals / Non-Goals

**Goals:**
- RSS produces items at all, and Medium content arrives among them, without writing a Medium adapter.
- dev.to's fetch window stops fighting the freshness filter.
- Per-source counts can distinguish one dead RSS feed from a healthy one.
- Every ingestion env var is discoverable in `.env.example`; the server still boots with none set.

**Non-Goals:**
- Reddit's OAuth 403 fix, GitHub Trending hardening, persisted run history and zero-streak alerting — each is a separate change in the roadmap.
- Retention/TTL, tombstone ledger, engagement re-polling, two-band dedup and story chains — these belong to the other three problem areas in the pipeline analysis.
- Switching HackerNews to the Algolia front-page API. HN works today; 31 requests per 3-hourly run is tolerable and bundling it here grows the blast radius for no user-visible gain.
- Changing `computeContentHash` semantics, the `NewsItem` schema, or the live-calibrated `0.88` semantic dedup threshold.

## Decisions

### 1. Per-feed RSS labels ship in this change, before feeds are populated

`content_hash = sha256(source:url)`. Changing an item's `source` label therefore changes its hash. RSS has stored **zero items for the life of the project**, so relabeling today costs nothing. If labels shipped after feeds started ingesting under the flat `rss` label, every already-stored RSS item would re-ingest once under its new `rss:<host>` label — a guaranteed duplicate wave.

This ordering constraint is the entire reason per-feed labeling is bundled with feed population rather than deferred to the observability change that consumes it. **Sequencing is load-bearing: label first, populate second, in one change.**

*Alternative considered:* keep `source: 'rss'` and add a separate `feed_host` field. Rejected — it needs a schema change, and every per-source aggregation (summary, future run history, zero-streak alerting) would have to special-case RSS instead of treating labels uniformly.

### 2. Hostname derivation must never throw

`new URL(feedUrl).hostname`, lowercased, leading `www.` stripped, prefixed with `rss:`. On a parse failure, fall back to the flat `rss` label and log. A malformed feed URL in config is an operator error that should degrade one feed's labeling, not abort the adapter — consistent with the existing per-feed `.catch()` at `adapters/rss.ts:29-32`.

### 3. Summary source list becomes a union of adapter names and item labels

`newsIngestion.service.ts:36` derives summary sources from adapter names alone. Once RSS emits `rss:<host>`, that list would report a flat `rss` row with zero counts while the real per-host counts (keyed by item label in `countBySource`) went unreported.

Fix: build the source list as the union of adapter names and `Object.keys(fetchedCounts)`. This keeps zero-count rows for adapters that fetched nothing or threw (needed for the future zero-streak alert) while giving each `rss:<host>` its own row. The `rss` adapter name itself will show a zero row when all feeds label successfully; that is acceptable and self-explanatory.

*Alternative considered:* have adapters declare their emitted labels up front. Rejected — labels are only knowable after a fetch, and the union is one line.

### 4. dev.to: two calls, merged, deduped by article id

`?top=7` means "top of the last 7 days" — a 7-day window feeding a 72-hour filter. Live check on 2026-07-16: the current top article was published 2026-07-09, seven days old and instantly discarded.

Replace with `?top=1&per_page=50` (top of the last day) plus `?state=rising&per_page=50` (currently-gaining articles, which skew fresh), issued in parallel via `Promise.all`, concatenated, deduped by `article.id` through a `Map`. Rising is included because `top=1` alone rewards only articles that already peaked; rising catches items on the way up, which is exactly what a trend feed wants.

Failure discipline mirrors `rss.ts`: catch per call, log, continue with whatever returned. Throw only when **both** calls fail, so a genuinely dead dev.to surfaces as a failed source rather than a silent zero.

*Alternative considered:* raise `NEWS_INGESTION_MAX_AGE_HOURS` to 168 h to match `top=7`. Rejected — it would widen the freshness window for every source, stale the whole feed, and enlarge the semantic-dedup pool, to work around one adapter's query string.

### 5. Curated starter feed list; Medium via official tag feeds

```
https://techcrunch.com/feed/
https://www.theverge.com/rss/index.xml
https://feeds.arstechnica.com/arstechnica/index
https://www.wired.com/feed/rss
https://hnrss.org/frontpage
https://medium.com/feed/tag/artificial-intelligence
https://medium.com/feed/tag/programming
https://medium.com/feed/tag/technology
```

`medium.com/feed/tag/<tag>` are official Medium RSS endpoints — publicly documented, no scraping, no auth. This is the whole "Medium missing" fix.

*Trade-off:* Medium tag feeds expose only ~10 latest items per tag and can lag. Acceptable — the 3-hourly cron picks up the delta, and hash dedup makes re-reads free.

*Note on `hnrss.org/frontpage`:* it overlaps the HackerNews adapter by design. The overlap is absorbed by hash dedup (different URL → different hash) and then by semantic dedup (same story, cosine ≥ 0.88). It is included as a cheap, live cross-check that the RSS path itself is working, since HN content is guaranteed to be flowing.

### 6. `.env.example` is the committed artifact; `.env` is an operator action

`.env` is gitignored, so populating it cannot be a code deliverable. The change ships the documented `.env.example`; setting the value in local `.env` and in the production host's environment is an explicit operator step in tasks.md. Config code needs no change — the parsing at `config/index.ts:181-184` already handles the comma-separated list.

## Risks / Trade-offs

- **A relabel after feeds go live would cause a duplicate wave** → Mitigated by ordering: this change relabels while RSS has zero stored items. Do not split labeling and feed population across releases.
- **`hnrss.org/frontpage` could double-store HN stories if semantic dedup underperforms** → Hash dedup catches identical URLs; semantic dedup catches paraphrases at 0.88. Verification task 5.4 explicitly watches for HN/RSS twins in the feed. Dropping this one feed is a zero-risk rollback if it misbehaves.
- **`state=rising` is not a formally documented dev.to API parameter** → It is in active use and returns the standard article shape. If it 404s or changes, the per-call catch degrades cleanly to `top=1` only, which alone already fixes the window bug. The change is still net-positive if rising never works.
- **Medium tag feeds may return low-quality or off-brand posts** → The relevance filter (`NEWS_INGESTION_MIN_RELEVANCE`, max-cosine against pooled brand voice) already gates this; feeds are config, so an operator can trim the list without a deploy.
- **More feeds mean more per-run latency** — 8 feeds fetched in parallel add roughly one slow feed's latency to a 3-hourly job → Acceptable; `Promise.all` bounds it to the slowest feed, not the sum.
- **A flat `rss` row with zero counts appears in the summary** alongside per-host rows → Cosmetic; keeping the union rule uniform is worth more than special-casing it away.
