## Why

The GitHub Trending adapter has two compounding weaknesses. First, it regex-scrapes the public trending page's HTML with no official API backing it — GitHub changing that markup silently returns zero parsed repos rather than an error, which is indistinguishable from "nothing is trending today." Second, even when the scrape works, live pipeline runs against the real dev database (captured during verification of the two preceding changes in this roadmap) show it fetching the *same* ~17 repos on every run, with 100% of them falling to hash-dedup: a repo that has been trending for days is stored once on its first successful run and then permanently blocked by its unchanging `content_hash` on every run after — exactly the "dedup starvation" the master remediation plan predicted, now confirmed live rather than theoretical. What survives dedup starvation then often dies at the relevance filter anyway, because a bare `owner/repo` title carries a weak embedding signal compared to a real headline.

This change fixes the first weakness directly (soft-failure visibility) and works around the second (starvation) without solving it — solving dedup starvation properly requires engagement re-polling and story-aware retention, which are separate, larger changes later in the roadmap. This change supplements the scrape with the GitHub Search API's recently-created, popular-repo listings, which churn in genuinely new items run over run and so are not starved by hash-dedup the way a multi-day trending list is.

## What Changes

- **A successfully-fetched trending page that parses to zero repositories becomes a reported failure, not a silent empty success.** The scrape and the new API-based path (below) are attempted independently; the adapter only throws (surfacing into `IngestionRun.sources[].error`, per the observability shipped earlier in this roadmap) when *both* paths yield nothing and at least one of them actually errored.
- **A second, official-API-based fetch path is added**: `GET https://api.github.com/search/repositories?q=created:>=<UTC date 72h ago>&sort=stars&order=desc&per_page=25`, using `NEWS_INGESTION_MAX_AGE_HOURS` to compute the date so the window tracks the pipeline's own freshness filter (same reasoning `news-source-quick-wins` applied to dev.to's mismatched window). These results carry a real `created_at` (mapped to `published_at`, making them freshness-filterable and — unlike scraped items — eligible for the semantic-dedup recent-items pool) and a real description.
- **Both paths are merged and deduplicated by repository full name** before returning, so a repo appearing in both the scrape and the API results is not double-counted.
- **Titles gain the repository description when one exists** (`owner/repo — <description, truncated>`), on both paths, to strengthen the otherwise-bare `owner/repo` title's embedding signal against the relevance filter.
- **New optional `GITHUB_TOKEN`** raises the Search API's unauthenticated rate limit (10 req/min, 60/hr) — the adapter is fully functional without it at this pipeline's call volume (one run per cron tick or manual trigger).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `news-ingestion`: the GitHub Trending source requirement changes from silent scrape-only fetching to soft-failure-visible fetching supplemented by the GitHub Search API.

## Impact

**Code:**
- `backend/src/app/modules/NewsIngestion/adapters/githubTrending.ts` — all changes are contained here: split into a scrape path and a new Search API path, merge-and-dedupe by repo full name, shared title-enrichment helper, soft-failure-to-error promotion.
- `backend/src/app/config/index.ts` — one new optional env var, `GITHUB_TOKEN`.
- `backend/.env.example` — document it.

**Explicitly unaffected:**
- Dedup starvation itself is *not* fixed — a repo that survives on both paths for consecutive days still gets hash-deduped after its first successful storage. This change increases the *rate of new items entering the pipeline* (fresh repos from the Search API path churn daily) without touching `content_hash` semantics, retention, or story-chain tracking, all of which are out of scope here and tracked by later phases in the master remediation plan.
- Every other adapter, the pipeline's dedup/freshness/relevance layers, and `ingestion-run-observability`'s run-history/zero-streak machinery — GitHub Trending's `fetched` counts simply become non-zero more often and its failures become visible there for free, exactly as observed live for Reddit in the preceding change.
- `RawNewsItem`'s shape — unchanged; only `title`, `snippet`, and `published_at` get richer values than before, within the existing fields.
