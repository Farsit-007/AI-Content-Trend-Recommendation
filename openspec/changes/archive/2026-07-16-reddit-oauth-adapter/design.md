## Context

`backend/src/app/modules/NewsIngestion/adapters/reddit.ts` currently calls `fetch('https://www.reddit.com/r/${subreddit}/top.json?limit=25', { headers: { 'User-Agent': 'GrowthStudioBot/1.0 (news ingestion)' } })` — unauthenticated. Reddit blocks this class of client with HTTP 403.

This is not a theoretical claim for this change to re-verify — it reproduced live, repeatedly, during manual verification of both preceding changes in this roadmap. Docker logs from real pipeline runs against the project's dev database show, verbatim:

```
[NewsIngestion] Reddit r/programming failed  err: "Reddit request failed for r/programming: 403"
[NewsIngestion] Reddit r/artificial failed    err: "Reddit request failed for r/artificial: 403"
[NewsIngestion] Reddit r/technology failed    err: "Reddit request failed for r/technology: 403"
```

And the `ingestion-run-observability` change's own live verification confirmed the zero-streak alert fires correctly against this exact failure: `GET /news-items/ingestion-runs` returned `{"source":"reddit","zero_streak":3,"alert":true}` after three consecutive real runs. This change has a working feedback loop already in place to prove it fixed the problem — no separate manual log-watching is needed once this ships; the admin run-history endpoint is the test oracle.

Verified current state:

| Fact | Location |
|---|---|
| Per-subreddit fetch failures are caught individually (`fetchSubreddit(...).catch(...)`) — one dead subreddit doesn't kill the others | `adapters/reddit.ts:44-49` |
| `RawNewsItem` mapping (title, url, snippet, published_at, raw engagement fields) is independent of how the listing was fetched | `adapters/reddit.ts:28-38` |
| `config.news_ingestion.reddit_subreddits` already exists (`REDDIT_SUBREDDITS`, comma-separated, default `programming,technology,artificial`) | `config/index.ts:75,189-191` |
| `redis` is a hard dependency already, exported from `app/lib/redis.ts`, ioredis-based | `lib/redis.ts:5` |
| `AdapterResult.error` (one string per adapter, surfaced into `IngestionRun.sources[].error` as of `ingestion-run-observability`) already exists as the place a "why is this source dead" message belongs | `newsIngestion.interface.ts` |

## Goals / Non-Goals

**Goals:**
- Reddit listings succeed via the auth method Reddit actually supports for scripts.
- A pipeline run with no Reddit credentials configured still boots and runs cleanly (existing "boot with nothing set" rule extends to these three new vars).
- Token acquisition is cheap: cached across runs, not re-fetched every 3 hours for no reason.
- The existing per-subreddit failure isolation and `RawNewsItem` output contract are preserved untouched.

**Non-Goals:**
- User-context OAuth (authorization-code grant, connecting a real Reddit account). Application-only client-credentials auth is sufficient and correct for reading public subreddit listings — there is no per-user action this adapter needs to perform on Reddit's behalf.
- Rate-limit backoff machinery beyond what already exists. App-only OAuth allows roughly 100 QPS averaged over 10 minutes; 3 subreddit calls per 3-hourly run (or occasional manual triggers) is nowhere near that ceiling.
- Any change to which subreddits are polled, or to the `RawNewsItem` shape.
- Fixing GitHub Trending or any other source — tracked by the sibling `github-trending-hardening` change.

## Decisions

### 1. Client-credentials grant, not password grant

No Reddit *account* credentials (username/password) ever enter this codebase's config. `client_id`/`client_secret` identify a registered **script**-type Reddit app, and `grant_type=client_credentials` obtains an application-only token scoped to public, unauthenticated-equivalent read access — exactly what listing a public subreddit's top posts needs, and exactly what Reddit's API terms prescribe for this use case.

*Alternative considered:* password-grant OAuth (script apps historically supported username+password alongside client credentials). Rejected — it would require storing a Reddit account's password in `.env`, is deprecated in Reddit's own guidance, and buys nothing over client-credentials for read-only public-listing access.

### 2. Token caching in Redis, not in-process memory

The pipeline can run from a scheduled cron tick or a manual admin trigger, and (per the single-process-cron caveat already documented in the master remediation plan) could in principle run from multiple processes if the backend ever scales horizontally. An in-process token cache would silently re-authenticate per process/restart; Redis is already a hard dependency and already used exactly this way elsewhere in the codebase (`loadTeamEmbeddings` in `newsItem.service.ts` caches computed data in Redis with a TTL). Reusing that pattern is consistent, not novel.

Cache key: `reddit:app_token`. TTL: `expires_in - 60` seconds — the 60-second margin means a token is never used within a minute of its real expiry, avoiding a race where a request starts against a token that expires mid-flight.

*Alternative considered:* no caching, fetch a token on every run. Rejected — wasteful (an extra round-trip on every 3-hourly cron tick and every manual trigger) for zero benefit, and the existing Redis dependency makes caching nearly free to add.

### 3. Explicit `t=day`, replacing an implicit default

The current unauthenticated call omits the `t` (time-window) parameter entirely, silently relying on Reddit's default for `/top.json` (which is `day` in practice, but undocumented as a stable contract). Making it explicit is a one-parameter change that removes that ambiguity and deliberately aligns the listing window with `NEWS_INGESTION_MAX_AGE_HOURS`'s default of 72 hours — a day-old top list comfortably fits inside a 72-hour freshness window, the same reasoning `news-source-quick-wins` applied to fix dev.to's mismatched window.

### 4. Single retry on 401, not a generic retry wrapper

If a listing request returns 401 (token expired early, or was revoked), the adapter invalidates the Redis-cached token and retries **once** with a freshly-fetched token. This covers the one realistic failure mode (a stale cache entry) without building generic retry/backoff infrastructure the rest of the codebase doesn't have and this adapter doesn't need — 429/5xx responses continue to be handled by the existing per-subreddit `.catch()`, unchanged.

### 5. Unconfigured credentials: skip cleanly, don't throw

When `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are unset, `fetchReddit()` logs a warning and resolves to `[]` without any network call — no attempt at the token endpoint, no attempt at listings. This is deliberately the *same* outward behavior as today's 403 (zero items, pipeline continues) but with an honest, distinct reason recorded in the adapter's error string, which `ingestion-run-observability`'s run history surfaces verbatim. An operator looking at run history sees "reddit not configured" instead of a network error, which is a materially different, more actionable signal.

*Alternative considered:* throw a startup-time error if credentials are missing. Rejected — violates the project's standing rule that the server boots with every ingestion-related env var unset (`news-source-quick-wins` established and tested this for the other vars; Reddit credentials should not be a special case that breaks it).

## Risks / Trade-offs

- **Datacenter-IP caveat**: this change was designed and will be *coded* against Reddit's OAuth API from this dev environment, but the master remediation plan is explicit that production/datacenter IPs are blocked *more* aggressively than residential ones, never less. OAuth removes the specific unauthenticated-403 failure mode this change targets, but production-host re-verification after deploy is still required before declaring Reddit healthy — this is exactly what `ingestion-run-observability`'s run history (shipped, live, already proven to alert correctly on this exact source) makes possible without re-reading logs.
- **One-time manual app registration is a hard external dependency this change cannot automate.** Until an operator registers a Reddit script app and sets the two credential env vars, Reddit stays at zero items — now for an honest, visible reason ("not configured") instead of a silent 403. This is a strict improvement even before the manual step happens.
- **Token cache staleness across a Redis flush**: if Redis is flushed (e.g. `FLUSHALL` during unrelated debugging), the next Reddit fetch just re-authenticates — no special handling needed, this falls out of the cache-miss path for free.
- **Client-credentials tokens are shared across the whole app**, not per-request — acceptable, since this is application-only auth with no per-user scope to isolate.
