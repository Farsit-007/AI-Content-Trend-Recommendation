## Why

Reddit has contributed exactly zero items to the news feed for the life of this project. The adapter calls `https://www.reddit.com/r/<sub>/top.json` unauthenticated, and Reddit blocks non-OAuth scripted clients with HTTP 403. This isn't a hypothetical: it reproduced live and repeatedly during verification of the two preceding changes in this remediation roadmap — every one of several manual pipeline runs against the real dev database logged `Reddit request failed for r/programming: 403`, `r/technology: 403`, `r/artificial: 403` (or occasionally a bare `fetch failed`), and the zero-streak alerting shipped in `ingestion-run-observability` picked it up correctly (`{"source":"reddit","zero_streak":3,"alert":true}`) using this exact, real, ongoing failure — not a synthetic one.

The error is caught per-subreddit and the run continues with zero Reddit items, so nothing crashes — but nothing works either, silently, and did so for an unknown period before this remediation effort started. Reddit's own supported path for read access from a script is OAuth2 application-only authentication against `oauth.reddit.com`, which this change implements.

## What Changes

- **Reddit adapter authenticates via OAuth2 client-credentials grant** (application-only auth — correct for a script reading public subreddit listings, no end-user Reddit account involved): `POST https://www.reddit.com/api/v1/access_token` with HTTP Basic `clientId:clientSecret` and `grant_type=client_credentials`.
- **Bearer token is cached in Redis** (`reddit:app_token`, TTL = `expires_in - 60` seconds) so repeated pipeline runs — cron every 3 hours, or manual triggers in between — reuse one token instead of re-authenticating every run.
- **Listings move to `oauth.reddit.com`**: `GET https://oauth.reddit.com/r/<sub>/top.json?limit=25&t=day`, with the bearer token and a Reddit-compliant `User-Agent`. `t=day` is now explicit (the previous unauthenticated call omitted it, relying on an implicit default) so the listing window is deliberately aligned with the pipeline's freshness filter.
- **On a 401 from the listings endpoint**, the adapter invalidates the cached token, fetches a fresh one, and retries the request exactly once — covering token revocation or an unexpected early expiry without a full outage.
- **Three new optional env vars**: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` (default `web:growth-studio-news:v1.0`). When the client id/secret are unset, the adapter logs a configuration warning and returns zero items without making any network call — the server still boots with none of them set, and the run history correctly shows "not configured" rather than a network 403.
- **`RawNewsItem` output shape is unchanged** — only transport and auth change; the `reddit.ts` → pipeline contract stays identical, so no other module needs to change.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `news-ingestion`: the Reddit source requirement changes from unauthenticated public JSON access to OAuth2 application-only authentication.

## Impact

**Code:**
- `backend/src/app/modules/NewsIngestion/adapters/reddit.ts` — rewritten around token acquisition/caching and the `oauth.reddit.com` host; `RedditPost`/`RedditListing` interfaces and the `RawNewsItem` mapping are unchanged.
- `backend/src/app/config/index.ts` — three new optional env vars in `envSchema`, exposed as `news_ingestion.reddit.{client_id, client_secret, user_agent}`.
- `backend/.env.example` — document the three new vars and the one-time Reddit app-registration steps.

**Uses existing infrastructure:**
- `backend/src/app/lib/redis.ts`'s `redis` export, for token caching — no new dependency.

**One-time manual prerequisite (cannot be automated by this change):** a Reddit **script**-type app must be registered at `reddit.com/prefs/apps` to obtain a client id and secret. Without this, the adapter degrades to its documented "not configured" no-op state — the pipeline is never blocked on it.

**Explicitly unaffected:**
- `REDDIT_SUBREDDITS` (the list of subreddits polled) — unchanged.
- Every other adapter, the pipeline's dedup/freshness/relevance layers, and the `ingestion-run-observability` run-history/zero-streak machinery — this change only changes how Reddit *fetches*; its output still flows through the exact same pipeline and gets the exact same observability for free.

**Verification caveat carried over from the preceding change:** end-to-end proof that Reddit items reach storage still depends on the pre-existing, out-of-scope `embeddings.ts` bug being tolerable or fixed (see `ingestion-run-observability`'s design.md) — but this change's own success criterion (Reddit's `fetched` count moving off zero, visible via the now-shipped run history) does not require that bug to be fixed, since `fetched` is counted in Layer 1, before Layer 2b's embedding calls.
