## Context

`adapters/reddit.ts` is the existing reference pattern for a credential-gated, token-cached adapter: it throws a descriptive `"<source> not configured (...)"` error (not an empty success) when required env vars are absent, caches an OAuth2 app-only bearer token in Redis under a fixed key with a TTL derived from the token response, and on a 401 response invalidates the cache, fetches a fresh token, and retries exactly once via a dedicated error subclass (`RedditAuthError`) that distinguishes "token expired, worth a retry" from any other failure. Product Hunt's API v2 uses the same OAuth2 client-credentials grant shape, so this adapter follows the same skeleton with two adaptations: Product Hunt is GraphQL (one POST, one query) rather than Reddit's REST-per-subreddit shape, and Product Hunt's token isn't documented as having a contractual expiry the way Reddit's `expires_in` response field is — so the cache TTL here is a fixed, deliberately-chosen constant rather than derived from the token response.

The GraphQL-specific risk this design centers on: a GraphQL server can return HTTP 200 with a body like `{ "errors": [...] }` and no `data` — from a REST-shaped adapter's perspective (only checking `res.ok`), this looks like total success, and the adapter would silently emit zero items instead of surfacing a real failure. That's exactly the class of "invisible dead source" failure the whole ingestion-pipeline observability program (run-history, zero-streak alerting) exists to catch, so this check is treated as load-bearing, not an edge case.

## Goals / Non-Goals

**Goals:**
- Authenticate via OAuth2 client-credentials, caching the bearer token in Redis so repeated pipeline runs (cron or manual) reuse one token instead of re-authenticating every run.
- Fetch the last 24 hours' top-voted Product Hunt posts in a single GraphQL query.
- Treat a GraphQL-level error response (200 + `errors` array, or missing `data.posts`) as a real adapter failure, not an empty success.
- On a 401 from the GraphQL endpoint, refresh the token and retry exactly once — matching the reddit.ts precedent so an expired-but-not-yet-cache-evicted token doesn't kill the whole adapter run.
- Make the "not configured" case (credentials absent) distinguishable in run history from "configured but broken," per every other credential-gated adapter in this pipeline.

**Non-Goals:**
- No pagination beyond the first page (`first: 25`) — Product Hunt is a daily leaderboard site; the pipeline runs 8x/day and hash-dedup already collapses repeated fetches of the same day's board, so one page is sufficient (same reasoning already applied to dev.to's daily-top endpoint).
- No token-refresh-ahead-of-expiry logic — the 24h TTL plus retry-on-401 covers early revocation without needing a scheduled refresh.
- No change to `content_hash` semantics, `RawNewsItem`'s shape, or any other adapter.

## Decisions

1. **GraphQL query fetches `postedAfter: <24h ago, ISO-8601 UTC>` ordered by `VOTES`, `first: 25`.** 24 hours (not 72, matching the pipeline's general freshness window) because Product Hunt is explicitly a *daily* leaderboard — a 72h window would return three days of overlapping "top of the day" boards, mostly hash-deduped noise. The `postedAfter` value is built via `new Date(Date.now() - 24h).toISOString()`, never a formatted local date, per the pipeline-wide UTC/epoch convention.
2. **Field mapping**: `source: 'producthunt'`, `source_id: node.id`, `title: `${node.name} — ${node.tagline}`` (the tagline carries the actual semantic payload — a bare product name like "Acme" would starve at the relevance filter the same way a bare GitHub `owner/repo` does, which `githubTrending.ts`'s `enrichTitle` already established as this pipeline's fix for that problem), `url: node.url` (the stable, canonical PH post page), `snippet: node.tagline`, `published_at: new Date(node.createdAt)`, `raw_points: node.votesCount`, `raw_comments: node.commentsCount`, `raw_stars_delta: 0`.
3. **Redis-cached token, 24h fixed TTL, key `producthunt:app_token`** — directly mirrors `reddit.ts`'s `TOKEN_CACHE_KEY`/`getAppToken` shape. Unlike Reddit's token response (which includes a real `expires_in`), Product Hunt's client-credentials token lifetime isn't contractually documented, so rather than trusting an assumed expiry, the cache TTL is a conservative fixed value and the 401-triggered retry-once path is the actual safety net for early revocation — the TTL is a cost optimization (skip a daily re-auth request), not the correctness mechanism.
4. **A dedicated `ProductHuntAuthError` class**, exactly mirroring `RedditAuthError`, distinguishes "the GraphQL endpoint returned 401" (worth one retry with a fresh token) from any other failure (GraphQL errors array, network failure, non-401 HTTP failure) which should propagate immediately without a wasted retry.
5. **GraphQL error detection is a dedicated check, run before touching `data.posts`**: if the parsed JSON body has a non-empty `errors` array, or `data.posts` is missing/undefined, throw with the first error's `message` (or a generic "unexpected response shape" message if no `errors` array is present). This runs regardless of `res.ok` — a GraphQL error is always HTTP 200, so `res.ok` alone would never catch it.
6. **No rate-limit handling beyond what's already implicit.** Product Hunt's complexity-based budget (450 points/15min) is negligible at one shallow query per run; no limiter or backoff is added, matching the "no retries/hammering, respect published limits" convention already applied to every other adapter in this pipeline.

## Risks / Trade-offs

- **[Risk] A GraphQL error silently producing zero items** (the central risk this design addresses) → **Mitigation**: the dedicated `errors`-array/missing-`data.posts` check (decision 5) runs unconditionally before mapping, with its own unit test asserting a 200-with-errors response throws rather than returning `[]`.
- **[Risk] The one-time manual OAuth app registration is a real onboarding step** that can't be scripted (unlike every other adapter in this plan, which needs zero or purely-config setup) → **Mitigation**: documented explicitly in `.env.example` with the exact portal URL and required fields; until registered, the adapter cleanly reports itself "not configured" rather than blocking the rest of the pipeline or the server's boot.
- **[Risk] Assumed 24h token TTL could be wrong in either direction** (token could expire sooner, wasting the cache; or live longer, meaning the daily re-auth is unnecessary) → **Mitigation**: wrong in either direction is low-cost — a premature cache expiry costs one extra token request/day; a real early revocation is caught by the 401-retry path regardless of what the TTL assumed. No behavior depends on the TTL being exactly correct.
- **[Risk] `first: 25` with `order: VOTES` could return the same top posts repeatedly across a slow news day**, all hash-deduped after the first run → **Mitigation**: this is expected and desired — matches how dev.to's daily-top endpoint already behaves in this pipeline; a slow day for launches should show high `hash_deduped`, not be treated as a bug.

## Migration Plan

- No data migration — this is a purely additive new source. No existing `content_hash` values, adapters, or config are touched.
- **Rollout**: the operator registers a Product Hunt OAuth application (one-time, out-of-band), sets `PRODUCTHUNT_CLIENT_ID`/`PRODUCTHUNT_CLIENT_SECRET` in `backend/.env`, and the source activates on the next scheduled or manual ingestion run — no code deploy needed beyond this change itself.
- **Rollback**: remove the registry entry (or leave the credentials unset) — the adapter cleanly reports "not configured" either way; no stored-data cleanup is implied since Product Hunt items are labeled distinctly (`source: 'producthunt'`) and don't interact with any other source's identity.

## Open Questions

None — the OAuth flow, GraphQL query shape, and failure-handling rules are all fully specified by the parent plan and the existing `reddit.ts` precedent.
