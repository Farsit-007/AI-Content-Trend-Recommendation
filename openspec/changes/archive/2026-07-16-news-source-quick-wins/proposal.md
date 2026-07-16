## Why

Three of the five news sources deliver zero or near-zero items into the feed, and every cause is a configuration or fetch-window defect rather than a missing feature. `NEWS_INGESTION_RSS_FEEDS` is optional and set nowhere — not in `backend/.env`, not in `.env.example` — so the RSS adapter iterates an empty array on every run and has stored zero items for the life of the project. Medium has no adapter and could only ever arrive through those (empty) RSS feeds, which is why it is entirely absent. The dev.to adapter fetches `?top=7` (the top of the last **7 days**) while `filterFresh` discards anything published more than `NEWS_INGESTION_MAX_AGE_HOURS` (72 h) ago, so nearly everything it fetches is thrown away, and the handful that survive are hash-deduped on every later run because the weekly top list barely changes.

These are the cheapest fixes in the pipeline remediation roadmap: no schema changes, no new collections, no new adapters, and they unblock three sources in under a day.

## What Changes

- **RSS items are labeled per feed.** The RSS adapter emits `source: "rss:<hostname>"` (e.g. `rss:techcrunch.com`, `rss:medium.com`) instead of a flat `rss`, so per-source counts and future per-source health signals can distinguish an individual dead feed from a healthy one.
- **The ingestion summary handles adapters that emit multiple source labels.** Per-source counts are keyed on the union of adapter names and the source labels actually present on items, so each `rss:<host>` appears as its own entry and an adapter that threw still appears with zero counts and its error.
- **dev.to fetch window matches the freshness window.** Replace the single `?top=7` call with `?top=1&per_page=50` plus `?state=rising&per_page=50`, merged and deduplicated by article id, so fetched articles are actually inside the 72 h window and the source stops starving on hash dedup.
- **`NEWS_INGESTION_RSS_FEEDS` is populated and documented** with a curated starter list that includes Medium tag feeds (`medium.com/feed/tag/<tag>`) — official RSS endpoints that resolve "Medium missing" with no new adapter code.
- **Every `NEWS_INGESTION_*` variable and `REDDIT_SUBREDDITS` is documented** in `backend/.env.example`. All of them are undocumented today, which is the root cause of the empty feed list. The server must still boot with none of them set.

Not breaking: `NewsItem.source` is an unconstrained `String` in the model and no frontend code reads the field, so relabeling is safe on both ends. This is also why the relabel must ship **now** — see design.md.

## Capabilities

### New Capabilities
<!-- None. This change corrects the behavior of the existing ingestion pipeline. -->

### Modified Capabilities
- `news-ingestion`: source normalization gains a per-feed RSS labeling requirement and the ingestion summary must cover every emitted source label; the dev.to source gains a requirement that its fetch window fit inside the freshness window; a new requirement mandates that all ingestion environment variables are documented and individually optional.

## Impact

**Code:**
- `backend/src/app/modules/NewsIngestion/adapters/rss.ts` — derive and attach a per-feed source label.
- `backend/src/app/modules/NewsIngestion/adapters/devto.ts` — two-call fetch, merge, dedupe by article id, per-call failure tolerance.
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts:36-37,127-134` — build the summary source list from the union of adapter names and item source labels.

**Configuration:**
- `backend/.env.example` — new documented `# ---- News ingestion ----` section including the curated `NEWS_INGESTION_RSS_FEEDS` starter list.
- `backend/.env` (gitignored, operator action) and the production host env — set `NEWS_INGESTION_RSS_FEEDS`.

**Explicitly unaffected:**
- `backend/src/app/config/index.ts` — no schema change needed; `NEWS_INGESTION_RSS_FEEDS` parsing already exists at `:70,181-184`.
- `computeContentHash`, the `NewsItem` model, and the semantic dedup threshold (`0.88`, live-calibrated) are untouched.
- No frontend changes — no component reads `NewsItem.source` today.

**Out of scope** (tracked by sibling changes in the roadmap): Reddit's OAuth 403 fix, GitHub Trending hardening, persisted run history / zero-streak alerting, retention, and engagement re-polling.
