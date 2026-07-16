## 1. One-time manual prerequisite (do first — everything else can proceed without it, but live verification needs it)

- [ ] 1.1 **Blocked — requires the user.** Register a **script**-type Reddit app at `https://www.reddit.com/prefs/apps` (any redirect URI, e.g. `http://localhost:3001`); capture the client id (shown under the app name) and secret. This cannot be automated — it needs a human with a Reddit account.
- [ ] 1.2 **Blocked — requires the user.** Note the registering account's username for the `REDDIT_USER_AGENT` format Reddit expects (`platform:app_id:version (by /u/username)`)

## 2. Config

- [x] 2.1 Added to `backend/src/app/config/index.ts` envSchema: `REDDIT_CLIENT_ID: z.string().optional()`, `REDDIT_CLIENT_SECRET: z.string().optional()`, `REDDIT_USER_AGENT: z.string().default('web:growth-studio-news:v1.0')`
- [x] 2.2 Exposed under `news_ingestion.reddit: { client_id, client_secret, user_agent }`
- [x] 2.3 Documented all three in `backend/.env.example` under the existing News ingestion section, with the app-registration steps and the required User-Agent format

## 3. Adapter

- [x] 3.1 `getAppToken()` in `adapters/reddit.ts`: Redis cache-first (`reddit:app_token`), else `POST https://www.reddit.com/api/v1/access_token` with HTTP Basic auth + `grant_type=client_credentials`, cached via `redis.set(key, token, 'EX', expires_in - 60)`
- [x] 3.2 `fetchSubredditListing` calls `oauth.reddit.com/r/<sub>/top.json?limit=25&t=day` with the bearer token; a distinct `RedditAuthError` on HTTP 401 drives `fetchSubredditWithRetry`, which invalidates the cached token, re-authenticates, and retries exactly once
- [x] 3.3 `fetchReddit` guards on `client_id`/`client_secret`. **Implementation refinement found while implementing this task**: the original task wording said "return `[]` immediately" for the unconfigured case, but that would have silently broken the promised behavior in design.md ("the run records a 'not configured' reason") — `runAllAdapters`/`AdapterResult.error` only capture a reason when an adapter *throws*, not when it resolves to an empty array. Fixed by having the unconfigured case `logger.warn` (for an immediate, distinct log line) and then throw (still zero network calls, still caught cleanly by the existing per-adapter wrapper) — this is what actually gets the "not configured" reason recorded in `IngestionRun.sources[].error`, verified live in task 4.4 below. When configured, one token is fetched per `fetchReddit()` invocation and shared across every subreddit call.
- [x] 3.4 `fetchSubredditListing`'s per-subreddit `.catch()` isolation and the unchanged `RawNewsItem` mapping preserved — only the URL/auth and 401-retry path changed
- [x] 3.5 Unit test: token cached in Redis reused across two `fetchReddit()` calls, no second token-endpoint request
- [x] 3.6 Unit test: a 401 triggers a token invalidation + single retry that succeeds
- [x] 3.7 Unit test: unconfigured credentials → zero network calls, `fetchReddit()` **rejects** with a "not configured" message (updated from the original "resolves to `[]`" per the 3.3 refinement above)
- [x] 3.8 Unit test: one subreddit's listing failing (non-401) still returns items from the other configured subreddit — `newsIngestion.reddit.test.ts` (4 tests total)

## 4. Verification

- [x] 4.1 `npx tsc --noEmit` and `eslint` clean on `adapters/reddit.ts`, `config/index.ts`, and the new test file
- [x] 4.2 `npm test` — 73/73 passing (69 from the two preceding changes + 4 new Reddit adapter tests)
- [x] 4.3 **Verified live, not synthetically**: local `.env` already had no `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` set (never added — task 1 is still pending). Restarted the project's `docker-compose` backend with this change's code; it booted cleanly (`Server is running on port 5000`, confirmed responsive via `GET /api/v1/news-items` → 200) — no config validation error, matching the existing "boot with nothing set" rule.
- [x] 4.3b (bonus, beyond what was asked) **Verified the "not configured" reason live end-to-end**, not just via mocks: triggered `POST /news-items/ingest` against the real dev DB and checked `GET /news-items/ingestion-runs`. The persisted run shows `{"source":"reddit","fetched":0,...,"error":"Reddit not configured (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET unset)"}` — proving the 3.3 refinement actually works through the full stack (adapter throw → `runAllAdapters` catch → `AdapterResult.error` → `ingestion-run-observability`'s `errorsBySource`/`buildSourceRunCounts` → the persisted document → the admin API), not just in the unit test's mocked call graph.
- [ ] 4.4 **Blocked on task 1.** Cannot trigger a real authenticated Reddit fetch without a registered app's client id/secret. Once task 1 is done: set `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` in `backend/.env`, restart the backend, trigger `POST /news-items/ingest`, then check `GET /news-items/ingestion-runs` — confirm reddit's `fetched` count is non-zero and `zero_streak` resets to 0 (it was last observed at `zero_streak: 3, alert: true` from real 403s during `ingestion-run-observability`'s verification, then `zero_streak: 1` after this change's 4.3b run recorded a different, distinct reason).
- [ ] 4.5 **Blocked — requires production access this session does not have.** Re-verify from the production host once deployed, per the master remediation plan's datacenter-IP caveat.
