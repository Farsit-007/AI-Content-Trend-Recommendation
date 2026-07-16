## Context

`backend/src/app/modules/NewsIngestion/adapters/githubTrending.ts` scrapes `https://github.com/trending` with regexes (`extractRepoBlocks`, `parseRepoBlock`) because GitHub has no official trending API. A parse failure returns an empty array rather than throwing — a deliberate soft-failure design documented in the adapter's own top-of-file comment, but one that makes "GitHub changed its markup" indistinguishable from "nothing is trending."

This change also has unusually strong live evidence behind it, gathered incidentally while verifying the three preceding changes in this roadmap against the real dev database. Every single observed pipeline run — four of them, across two different changes' verification sessions — logged the identical shape for this source:

```
{"source":"github_trending","fetched":17,"fresh_dropped":0,"hash_deduped":17,"semantic_deduped":0,"relevance_dropped":0,"stored":0}
```

17 fetched, 17 hash-deduped, every time, with zero variation. This is dedup starvation caught in the act, not inferred: the scrape is finding the same 17 repos on every run (GitHub's trending list changes slowly), and every one of them is already in the `news_items` collection from an earlier successful run, so `content_hash` uniqueness silently discards 100% of them before they ever reach freshness or relevance scoring. This is exactly the failure mode the master remediation plan predicted for this source and is precisely why this change adds a second fetch path that churns in genuinely new items rather than trying to "fix" the scrape.

Verified current state:

| Fact | Location |
|---|---|
| `extractRepoBlocks`/`parseRepoBlock` regex-parse the trending page; zero matches → empty array, not a throw | `adapters/githubTrending.ts:21-24,26-48` |
| `fetchGithubTrending` throws only on a non-OK HTTP response, never on a 200-but-empty parse | `adapters/githubTrending.ts:50-60` |
| Scraped items always have `published_at: undefined` | `adapters/githubTrending.ts:43` |
| `filterFresh` treats a missing `published_at` as fresh — scraped items always pass this layer | `newsIngestion.utils.ts:21-24` (unchanged by this roadmap so far) |
| `fetchRecentEmbeddings` filters on `published_at: { $gte: cutoff }` — items with no `published_at` are excluded from the semantic-dedup recent-items pool, regardless of when they were actually stored | `newsIngestion.utils.ts:46-49` |
| `content_hash = sha256(source:url)`, permanent and source-independent of freshness | `newsIngestion.utils.ts:14-15` — unchanged; this change does not touch hash semantics |
| Live-observed: `fetched: 17, hash_deduped: 17` identically across 4 separate real pipeline runs | Docker logs / `IngestionRun` documents captured while verifying `news-source-quick-wins`, `ingestion-run-observability`, and `reddit-oauth-adapter` |

## Goals / Non-Goals

**Goals:**
- A markup change that breaks the scrape is visible (an error, not a silent zero), using the observability shipped in `ingestion-run-observability`.
- New items enter the pipeline even while a static trending list is fully starved by hash-dedup.
- Bare `owner/repo` titles get a stronger embedding signal so they survive the relevance filter more often.
- No retry-hammering of the scrape target (ToS discipline, per the master remediation plan's caveat 6).

**Non-Goals:**
- Fixing dedup starvation itself. The proper fix is engagement re-polling + retention (master plan Phases 3-4) and/or story-aware dedup (Phase 5) — both are separate, larger changes. This change only increases the *rate* of fresh items arriving, via a source that isn't starved the same way.
- Changing `content_hash` semantics, the `NewsItem` schema, or any other adapter.
- Any change to `NEWS_INGESTION_MIN_RELEVANCE` or the relevance-scoring formula itself — title enrichment addresses the *input* to that formula, not the formula.

## Decisions

### 1. Search API supplement, not scrape retry-hammering

Retrying the trending-page scrape on failure (different headers, delays, alternate parsing) was considered and rejected outright: it's the literal behavior the master plan's ToS-discipline caveat warns against ("scraping-based sources must always fail soft and must never gain retry-hammering"). The GitHub Search API is official, published, rate-limited by GitHub itself, and returns a strictly richer object (real `created_at`, real `stargazers_count`, real `description`) than anything scraping the page's HTML could reliably extract.

### 2. `created:>=<date>` matches the pipeline's own freshness window, not a fixed lookback

`created:>=${threeDaysAgoISO}` where the date is computed as `new Date(Date.now() - config.news_ingestion.max_age_hours * 60 * 60 * 1000)` formatted `YYYY-MM-DD`, UTC. This is the same pattern `news-source-quick-wins` used to fix dev.to's mismatched fetch window (`?top=7` vs a 72h filter) — the query window should track the config value, not a hardcoded guess, so a future change to `NEWS_INGESTION_MAX_AGE_HOURS` doesn't silently re-introduce a window mismatch for this source too.

*Why this sidesteps starvation without fixing it:* a repo created 2 days ago is a *different* repo tomorrow's `created:>=` query won't return once it ages past the window — so the Search API path naturally rotates in new candidates every run, unlike the trending scrape's slow-moving top-N list. It's still subject to hash-dedup once stored, exactly like everything else; it just isn't the *same 17 items* every single run.

### 3. Merge by repository full name, dedupe before returning

`source_id` is the repo's `owner/repo` full name on both paths, so if a repo is both currently trending *and* was created within the freshness window, in-run dedup collapses it to one item via a `Map` keyed on full name — the same repo doesn't get hash-deduped against itself or scored twice. This reuses the existing hash-dedup-friendly `source_id` convention rather than inventing a new key.

### 4. `owner/repo — <description>` title enrichment, both paths

A bare `owner/repo` string has a weak cosine-similarity signal against brand-voice examples that are full sentences. Prefixing the description (when present, truncated to ~200 characters to keep feed rendering sane) gives the relevance-scoring embedding actual semantic content to compare, while the untruncated description still goes into `snippet` as before. Applied uniformly to both the scrape and API paths so a repo's title doesn't differ depending on which path found it.

### 5. Soft-failure promotion: throw only when both paths fail to produce anything

Each path (scrape, API) is wrapped in its own try/catch internally. The adapter throws — surfacing into `AdapterResult.error` and, via `ingestion-run-observability`, into a persisted `IngestionRun.sources[].error` and the zero-streak alert — only when the *merged* result is empty **and** at least one path recorded an actual error (as opposed to both paths legitimately returning zero new items, which is a real, non-alarming outcome this adapter should not misreport as broken). This mirrors the "unconfigured vs. broken" distinction `reddit-oauth-adapter` just established: a thrown error must carry an honest, specific reason, not just "something went wrong."

*Alternative considered:* throw whenever the scrape alone yields zero, regardless of the API path's outcome. Rejected — the scrape legitimately returning zero (e.g. a markup tweak that isn't a full break, or GitHub genuinely deprioritizing the page) shouldn't page anyone if the API path is still delivering real items; only a total, unexplained loss of signal should.

### 6. `GITHUB_TOKEN` optional, unauthenticated-safe by design

Unauthenticated Search API access is capped at 10 requests/minute and 60/hour — comfortably above this pipeline's call volume (one call per 3-hourly cron tick, plus occasional manual triggers). `GITHUB_TOKEN`, when set, is sent as `Authorization: Bearer <token>` to raise headroom for a future higher-frequency schedule, but its absence must never break the adapter — consistent with the standing "boots with nothing set" rule this roadmap has held to for every new source's credentials so far (RSS feeds, Reddit's OAuth pair, and now this).

## Risks / Trade-offs

- **The Search API's `created:>=` query surfaces newly-created repos, which skew toward low-quality/spam relative to an established trending list** → Acceptable; the existing relevance filter (against pooled brand-voice examples) and `sort=stars&order=desc` both already bias toward signal over noise, and this is config (`per_page=25`), not a hard commitment — an operator can tune it without a deploy.
- **Merging two paths roughly doubles this adapter's outbound requests per run** (one page fetch, one API call, vs. one page fetch today) → Negligible; both are single requests, not per-item calls, and well within GitHub's rate limits either way.
- **Title enrichment truncation (~200 chars) could cut a description mid-word** → Cosmetic; the full, untruncated description is still preserved in `snippet` for anything downstream (categorization, display) that wants it.
- **This change makes GitHub Trending's `fetched` count rise, which increases Layer 2b (embedding) call volume** → Same pre-existing, out-of-scope `embeddings.ts` robustness gap flagged in `news-source-quick-wins` and reproduced live in every subsequent change's verification applies here too; this change doesn't make that gap worse in kind, only in volume, and does not attempt to fix it (still out of scope).
