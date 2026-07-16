# News Sources — Outage Diagnosis, Fixes, and New Source Catalog

**Date:** 2026-07-16
**Parent doc:** [NEWS-PIPELINE-ANALYSIS.md](./NEWS-PIPELINE-ANALYSIS.md)
**Covers reported problems:** (1) "No news coming from reddit, rss, sometimes very rarely from github trending and dev.to, medium" and (2) "Add more open source news platforms for scraping."

---

## Part A — Why each existing source is silent, and the exact fix

Adapter registry: `backend/src/app/modules/NewsIngestion/adapters/index.ts` — `hackernews`, `devto`, `github_trending`, `reddit`, `rss`. Every adapter failure is caught and converted to an empty item list (`index.ts:23-27`), so a dead source is invisible without Part C's observability.

### A.1 Reddit — blocked with HTTP 403 (verified live)

**Diagnosis.** `adapters/reddit.ts:22` calls `https://www.reddit.com/r/<sub>/top.json?limit=25` with a custom User-Agent and no authentication. Tested live on 2026-07-16 with the adapter's exact headers: **HTTP 403**. Since Reddit's 2023 API policy change, the public `.json` endpoints reject most scripted/non-browser clients, and datacenter IPs (i.e., any production host) are blocked even harder. This is not intermittent and will not fix itself.

Two secondary defects, currently masked by the 403:
- `top.json` without a `t=` parameter defaults to `t=day`, which is fine — but `limit=25` of r/technology's daily top includes many sub-72h-old posts that are *hash-deduped on every subsequent 3-hour run*, so even a working adapter would taper to a trickle after the first run each day.
- `raw_points` uses `ups` (`reddit.ts:35`), which Reddit fuzzes; `score` is the stable field.

**Fix — switch to the official OAuth "script app" flow (free, ToS-compliant):**

1. One-time manual step (needs a Reddit account): create an app of type **script** at `https://www.reddit.com/prefs/apps` → yields `client_id` + `client_secret`.
2. New env vars (all optional so the server still boots without them; adapter self-disables and reports "unconfigured" in run history when absent):
   ```
   REDDIT_CLIENT_ID=
   REDDIT_CLIENT_SECRET=
   REDDIT_USER_AGENT=web:growth-studio:v1.0 (by /u/<account>)   # Reddit requires this exact format
   ```
3. Token flow (client-credentials grant, no user login needed for read-only public data):
   - `POST https://www.reddit.com/api/v1/access_token` with HTTP Basic auth (`client_id:client_secret`), body `grant_type=client_credentials`.
   - Token lives ~24 h. Cache it in Redis (`redis.setex('reddit_oauth_token', expires_in - 60, token)`) — the ingestion cron fires 8×/day, so this is one token request per day, not per run.
4. All data calls move to `https://oauth.reddit.com/r/<sub>/top?t=day&limit=25` with `Authorization: Bearer <token>` and the registered User-Agent.
5. Map `score` (not `ups`) → `raw_points`.

**Rate limits & caveats:**
- Free tier: 100 queries/minute per client. Current usage: 3 subreddits × 8 runs/day = 24 requests/day. Headroom is enormous; still, honor `X-Ratelimit-Remaining` headers with a simple "sleep until reset if remaining < 5" guard so adding 30 subreddits later can't trip it.
- A 401 mid-run means the cached token expired early → invalidate the Redis key, re-auth once, retry once. Never loop.
- If credentials are unset, the adapter must return a *distinguishable* status (`skipped: unconfigured`) rather than an empty success — otherwise the Part C zero-alert fires forever on a source that is intentionally off.
- `REDDIT_SUBREDDITS` (default `programming,technology,artificial`, `config/index.ts:75`) should be revisited: r/technology's top posts are mostly mainstream/politics-adjacent and score poorly against a dev-brand voice pool — likely contributors to relevance-filter drops. Suggested default: `programming,webdev,MachineLearning,devops,ExperiencedDevs`.

### A.2 dev.to — freshness-window mismatch (verified live)

**Diagnosis.** `adapters/devto.ts:14` fetches `https://dev.to/api/articles?top=7` = highest-reaction articles of the **last 7 days**. Live response on 2026-07-16: the #1 article was published 2026-07-09 (7.0 days old). `filterFresh` (`newsIngestion.utils.ts:21-24`) discards anything older than `NEWS_INGESTION_MAX_AGE_HOURS=72`. So the majority of every fetch is dead on arrival, and the survivors — being a slowly-rotating weekly leaderboard — are hash-deduped on all subsequent runs. Net: "sometimes very rarely," exactly as reported.

**Fix (30 minutes):** fetch windows must match the freshness window.
1. Replace with two calls, merged and de-duplicated by article id:
   - `GET /api/articles?top=1&per_page=50` — top of the last 24 h (guaranteed inside the 72 h window).
   - `GET /api/articles?state=rising&per_page=50` — articles gaining traction *now*; this is where trend-detection value lives.
2. Both are unauthenticated and free. Optional `api-key` header (free from dev.to settings) lifts rate limits; not needed at 16 requests/day.
3. Keep mapping `public_reactions_count → raw_points`, `comments_count → raw_comments`.

**Caveats:** `state=rising` articles have low absolute engagement (that's the point) → their `trend_score` (log-scaled, `newsIngestion.scoring.ts:28-31`) will be modest, and the engagement re-polling job (Retention doc §3) is what lets a rising article's score climb after ingestion. These two changes are complementary, not redundant.

### A.3 GitHub Trending — brittle scrape + dedup starvation

**Diagnosis.** Two independent causes:
1. **Brittle scraping** (self-documented at `adapters/githubTrending.ts:3-10`): regex over `github.com/trending` HTML. When GitHub ships a markup change, `extractRepoBlocks` returns `[]` — a *silent* zero, indistinguishable from "nothing trending."
2. **Dedup starvation:** trending repos persist for days. `content_hash = sha256('github_trending:https://github.com/owner/repo')` is stored once, forever (`newsIngestion.utils.ts:14-15`, unique index `newsItem.model.ts:7`). Every subsequent appearance is dropped at Layer 2. Only brand-new entrants pass — a handful per day — and many of those then die at the relevance filter because the embedded text is just `owner/repo` + a one-line description (weak similarity to brand-voice prose).

**Fix:**
1. **Keep the scrape** (there is genuinely no official trending API) but wire its zero-result case into the Part C alert (`fetched=0` for 2+ consecutive runs on this source = markup broke, not quiet news day — trending is never empty).
2. **Add a resilient fallback** using the official Search API when the scrape yields zero: `GET https://api.github.com/search/repositories?q=created:>YYYY-MM-DD&sort=stars&order=desc&per_page=25` (unauthenticated: 10 req/min — fine; with a free PAT: 30 req/min). This measures "new repos gaining stars fast," which approximates trending and is ToS-clean.
3. **Re-trending is an *update*, not a duplicate.** A repo that re-enters trending with `847 stars today` after first being stored with `312 stars today` is a progressive-trend event — route it through the update path (Dedup doc §5) to refresh the stored item's engagement/trend instead of dropping it at Layer 2. Concretely: hash-dedup hits on `github_trending` items should trigger an engagement-refresh on the stored row rather than a plain skip.
4. **Enrich the embedded text**: fetch the repo description + topics from `GET /repos/{owner}/{repo}` (or parse more from the trending page) so the embedding has enough signal to survive the relevance filter.

**Caveats:** never add retries/hammering to the HTML scrape (respect GitHub's robots posture; one GET per run, fail soft). `published_at` stays `undefined` for trending items — they bypass `filterFresh` **and** are excluded from the semantic-dedup recent pool (`fetchRecentEmbeddings` filters `published_at: { $gte: cutoff }`, `newsIngestion.utils.ts:47`). Set `published_at = fetch time` for trending items to close both holes; the Retention doc depends on every item having a date.

### A.4 RSS — empty by configuration (and how Medium fits in)

**Diagnosis.** `NEWS_INGESTION_RSS_FEEDS` is optional (`config/index.ts:70`) and defaults to an empty list (`config/index.ts:181-184`). It is set in **neither `backend/.env` nor `backend/.env.example`** (verified 2026-07-16). The adapter (`adapters/rss.ts`) loops over nothing and returns `[]` — every run, by design. **Medium** has no dedicated adapter and no dedicated API; Medium tag/publication RSS feeds are the intended (and only reasonable) path, so "no Medium news" is the same root cause.

**Fix:**
1. Populate the env var (and document it in `.env.example`) with a curated starter list:
   ```
   NEWS_INGESTION_RSS_FEEDS=https://techcrunch.com/feed/,https://www.theverge.com/rss/index.xml,https://feeds.arstechnica.com/arstechnica/technology-lab,https://medium.com/feed/tag/artificial-intelligence,https://medium.com/feed/tag/programming,https://stackoverflow.blog/feed/,https://blog.cloudflare.com/rss/,https://www.smashingmagazine.com/feed/,https://feed.infoq.com/,https://changelog.com/feed
   ```
2. **Per-feed source labeling.** Today every feed item gets `source: 'rss'` (`adapters/rss.ts:14`). Change to `rss:<hostname>` (e.g. `rss:medium.com`, `rss:techcrunch.com`) so: per-source health monitoring (Part C) is meaningful; the feed UI can attribute stories; and `countBySource` summaries in `newsIngestion.service.ts` stop lumping ten feeds into one line. The `content_hash` already includes the URL, so this label change cannot create duplicates — but note it *does* change the hash for any previously stored RSS items (source is part of the hash input); with the DB effectively empty of RSS items today, this is a zero-cost migration, which is exactly why the label change should ship *before* feeds are populated.
3. **Conditional GET.** Store per-feed `ETag`/`Last-Modified` in Redis and send `If-None-Match`/`If-Modified-Since`; a 304 costs nothing and is polite at 8 runs/day × N feeds. `rss-parser` accepts custom headers via its constructor.
4. **Per-feed timeout + isolation** already exists (`rss.ts:28-33` catches per-feed); add a 10 s timeout (`rss-parser` `timeout` option) so one hung feed can't stall the whole `Promise.all` (the pipeline currently has no adapter-level timeout at all).

**Medium-specific caveats:** Medium feeds return only the ~10 latest items per tag with truncated content (`contentSnippet` is enough for the embedding); there is no engagement signal (claps are not in the feed) → `raw_points=0`, so Medium items rely entirely on relevance for opportunity score. That is acceptable — but do *not* scrape Medium article pages for clap counts (paywall + ToS problems). Feeds: `https://medium.com/feed/tag/<tag>` and `https://medium.com/feed/<publication>`.

---

## Part B — New free/open sources catalog (tiered)

Rules used for this catalog: free tier sufficient for 8 runs/day; documented public API or explicit RSS support (ToS-safe); has either an engagement signal (feeds `trend_score`) or high editorial quality (relevance-driven). Engagement mapping targets the existing `raw_points / raw_comments / raw_stars_delta` fields (`newsIngestion.interface.ts`).

### Tier 1 — implement first (official APIs, engagement signals, trivial adapters)

| Source | Endpoint | Auth | Rate limit | Engagement mapping | Notes / caveats |
|---|---|---|---|---|---|
| **Lobsters** | `https://lobste.rs/hottest.json`, `/newest.json` | none | be polite; 1 req/run | `score→raw_points`, `comment_count→raw_comments` | Highest signal-to-noise dev community after HN; JSON is stable and official. ~25 items/call. |
| **HN via Algolia** (replaces 31-request Firebase flow) | `https://hn.algolia.com/api/v1/search?tags=front_page` and `search_by_date?tags=story&numericFilters=points>50` | none | 10k req/hr | `points`, `num_comments` | One request instead of `topstories.json` + 30 item fetches (`adapters/hackerNews.ts:17-28`). `search_by_date` + points filter catches risers between front-page snapshots. Keep `source: 'hackernews'` and the same `source_id` (HN item id) so hashes stay compatible. |
| **Product Hunt** | GraphQL `https://api.producthunt.com/v2/api/graphql` (`posts(order:VOTES, postedAfter:…)`) | free OAuth app token | 450 pts/15 min (a posts query ≈ trivial) | `votesCount→raw_points`, `commentsCount→raw_comments` | Excellent for "new AI tool launching" content angles. One-time app registration. |
| **Mastodon trending links** | `https://mastodon.social/api/v1/trends/links` | none | 300 req/5 min | `history[0].accounts/uses → raw_points` | Public endpoint, no auth. Returns *links being shared right now* with per-day share counts — a true real-time trend signal, and the URLs are external articles (great cross-source dedup fodder). Query 2–3 large instances. |

### Tier 2 — strong additions after Tier 1

| Source | Endpoint | Auth | Engagement | Notes / caveats |
|---|---|---|---|---|
| **Google News RSS queries** | `https://news.google.com/rss/search?q=<topic>+when:1d&hl=en-US&gl=US&ceid=US:en` | none | none | Programmable per-topic firehose (e.g. one query per `NEWS_CATEGORIES` entry). Links are Google-redirect URLs — resolve to the canonical URL *before* hashing or cross-source dedup breaks. Unofficial-but-stable; keep request volume low (≤ a few queries/run). |
| **GitHub Releases/Repo Atom feeds** | `https://github.com/{owner}/{repo}/releases.atom` | none | none | Perfect for the "Fable released → updated" progressive story class: version releases of watched tools (react, node, tailwind, …). Feed list = config env var. Plugs into the existing RSS adapter once per-feed labeling (A.4.2) exists. |
| **Bluesky** | `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=<topic>&sort=top` (public, no auth) | none | `likeCount→raw_points`, `replyCount→raw_comments` | Growing dev community. Posts are short — embed post text + linked-page title. Filter to posts containing external links to keep it "news," not chatter. |
| **arXiv** | `http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate` | none | none | For AI-category depth. Atom format (RSS adapter compatible). Abstracts embed beautifully → strong relevance scores. Max 1 req/3 s per their ToS — trivially satisfied. |
| **Stack Overflow / SE hot questions** | `https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow` | none (key raises quota to 10k/day) | `score→raw_points`, `answer_count→raw_comments` | "What devs are struggling with today" — strong content-idea signal for a growth team. |

### Tier 3 — pure-RSS editorial expansion (zero code once A.4 ships)

All of these go straight into `NEWS_INGESTION_RSS_FEEDS`; no adapters needed: The Verge, Ars Technica, TechCrunch, Wired, MIT Technology Review, InfoQ, The New Stack, Smashing Magazine, CSS-Tricks, web.dev blog, Cloudflare blog, Netflix/Uber/Stripe engineering blogs, The Changelog, Hacker Noon (`https://hackernoon.com/feed`), DZone. **Caveat:** editorial feeds have no engagement signal, so they compete on relevance alone; keep the total feed list ≤ ~25 or the LLM categorization cost (batches of 10, `newsIngestion.categorize.ts:5`) and embedding cost per run grow linearly with fetch volume.

### Deliberately excluded (and why — resist adding these)

- **Twitter/X:** API pricing makes it non-viable for a free pipeline; scraping violates ToS.
- **daily.dev:** no public API; their content is aggregated from sources listed above anyway.
- **Medium clap-count scraping:** paywalled pages, ToS risk; feeds only (A.4).
- **LinkedIn news:** no API for feed content; scraping is aggressively blocked and a ToS violation.
- **Anything requiring headless-browser scraping:** operationally fragile (Chromium in prod), high ban risk, and every item above provides equivalent coverage without it.

---

## Part C — Observability: the fix that makes all other fixes stick

Reddit has been silently dead for (at minimum) weeks — the pipeline reported success the whole time. Without this section, every fix above eventually regresses invisibly. This is the highest-priority engineering item after the Phase 0 config changes.

### C.1 Persisted run history

New collection `ingestion_runs` (new module `backend/src/app/modules/IngestionRun/`, mirroring existing module structure):

```ts
{
  started_at: Date,
  finished_at: Date,
  trigger: 'cron' | 'manual',
  sources: [{
    source: string,            // 'reddit', 'rss:medium.com', …
    status: 'ok' | 'error' | 'unconfigured',
    error?: string,
    fetched: number,
    freshness_dropped: number, // per-layer counts — the pipeline already
    hash_deduped: number,      // computes fetched/fresh/unique/relevant
    semantic_deduped: number,  // per source (newsIngestion.service.ts:37-76);
    relevance_dropped: number, // this just persists what today is discarded
    stored: number,
  }],
  total_stored: number,
  duration_ms: number,
}
```

Implementation is cheap: `runIngestionPipeline` already computes `fetchedCounts`, `freshCounts`, `uniqueCounts`, `relevantCounts` per source (`newsIngestion.service.ts:37-76`) — they are currently used only for the in-memory return value. Persist them. Add a TTL index (`expireAfterSeconds` ≈ 30 days) so run history cleans itself — unlike `news_items`, nothing references these rows, so a plain Mongo TTL index is safe here.

### C.2 Health rules & surfacing

- `GET /api/v1/news-ingestion/runs?limit=20` (admin/super_admin, reuse existing auth middleware) + a panel on the dashboard Admin page (`frontend/src/pages/dashboard/Admin.tsx`).
- **Zero-streak rule:** `status='ok'` but `fetched=0` for N=3 consecutive runs → `degraded` badge per source. `status='error'` on 2 consecutive runs → `down` badge. `unconfigured` renders as neutral, never alerts (see A.1 caveat).
- **Relevance-drop rule:** if `relevance_dropped / fetched > 0.9` across a full day, surface a "relevance filter may be over-aggressive" warning — this catches the silent-killer described in C.3.
- Optional escalation later: webhook/email on `down`. Don't block on this; the visible admin panel is the 90% win.

### C.3 The relevance filter needs a visibility valve

Once any team uploads brand-voice examples, every item must hit max-cosine ≥ 0.4 (`NEWS_INGESTION_MIN_RELEVANCE=4.0` vs `scoreRelevance` = max-cosine × 10, `newsIngestion.scoring.ts:17-21`; filter at `newsIngestion.service.ts:72-75`). Whether 0.4 is right depends entirely on what the pooled examples look like — and today there is zero data on what's being dropped.

1. Ship C.1 first; watch `relevance_dropped` per source for a week.
2. If legitimate news is dying there (expected for Reddit/generic-tech and bare `owner/repo` GitHub items), prefer **flag-don't-drop**: store below-threshold items with `needs_review: true` and exclude them from the default feed query, rather than lowering the global threshold. This keeps the feed clean while making the filter's behavior auditable and reversible — and retention (Retention doc) will age the flagged items out anyway.
3. Caveat: flag-don't-drop increases stored volume and LLM categorization cost. Gate it per-source if needed (e.g., only for sources with engagement signals, where trend data adds recovery value).

---

## Acceptance checklist for this document's scope

- [ ] `.env.example` documents every `NEWS_INGESTION_*` and `REDDIT_*` variable with comments and safe defaults
- [ ] A full pipeline run from the production host shows `fetched > 0` for: hackernews, devto, github_trending, reddit, and ≥ 5 labeled RSS feeds including `rss:medium.com`
- [ ] Reddit adapter: token cached in Redis; run history shows exactly one auth request per ~24 h; `unconfigured` state verified by unsetting the env vars
- [ ] dev.to: run history shows non-zero `stored` across three consecutive runs (rising + daily-top windows rotate enough to beat hash dedup)
- [ ] Zero-streak alert verified by pointing one adapter at a dead endpoint in a dev environment
- [ ] At least Tier 1 new sources live with per-source run-history rows
