## 1. One-time manual prerequisite (do first — cannot be automated)

- [x] 1.1 Registered by the user at https://www.producthunt.com/v2/oauth/applications ("AI Tren Recommendation" app); client id/secret captured and added to `backend/.env`

## 2. Config

- [x] 2.1 `envSchema`: add `PRODUCTHUNT_CLIENT_ID: z.string().optional()`, `PRODUCTHUNT_CLIENT_SECRET: z.string().optional()`; export `news_ingestion.producthunt: { client_id, client_secret }`
- [x] 2.2 Document both vars in `backend/.env.example` (registration URL, that a "script"-style app with any redirect URI works, that the server boots fine with both unset)

## 3. Adapter

- [x] 3.1 Create `adapters/producthunt.ts`: unconfigured guard — throw `'producthunt not configured (PRODUCTHUNT_CLIENT_ID/PRODUCTHUNT_CLIENT_SECRET unset)'` before any network call when either var is absent
- [x] 3.2 `getAppToken()`: Redis `GET`/`SET ... EX 86400` on key `producthunt:app_token` (mirror `reddit.ts`'s `getAppToken`); `requestAppToken()` POSTs `https://api.producthunt.com/v2/oauth/token` with JSON body `{ client_id, client_secret, grant_type: 'client_credentials' }`
- [x] 3.3 `fetchTopLaunches(token)`: single GraphQL POST (`Authorization: Bearer <token>`) querying `posts(order: VOTES, postedAfter: <24h-ago ISO>, first: 25) { edges { node { id name tagline url votesCount commentsCount createdAt } } }`
- [x] 3.4 GraphQL-error handling: a response with a non-empty `errors` array or missing `data.posts` throws (with the first error's `message` when present) — checked before any other processing, regardless of `res.ok`
- [x] 3.5 `ProductHuntAuthError` class + 401 handling: on HTTP 401, invalidate the Redis-cached token, obtain a fresh one, and retry `fetchTopLaunches` exactly once (mirror `reddit.ts`'s `RedditAuthError`/`fetchSubredditWithRetry` pattern)
- [x] 3.6 Map fields per design decision 2 (`source: 'producthunt'`, `source_id: node.id`, enriched title, `url: node.url`, `snippet: node.tagline`, `published_at: new Date(node.createdAt)`, `raw_points: node.votesCount`, `raw_comments: node.commentsCount`, `raw_stars_delta: 0`)
- [x] 3.7 Register `{ source: 'producthunt', fetch: fetchProductHunt }` in `adapters/index.ts`

## 4. Tests

- [x] 4.1 `newsIngestion.producthunt.test.ts` (mock `global.fetch` + `redis`, copy `newsIngestion.reddit.test.ts` style): engagement + title-enrichment mapping; token cached and reused across two `fetchProductHunt()` calls; 401 → invalidate → fresh token → retry once; 200-with-`errors`-array throws without emitting items; missing `data.posts` throws; unconfigured credentials → zero fetch calls

## 5. Verification

- [x] 5.1 `cd backend && npm test && npm run build`
- [x] 5.2 Live-verified against real Atlas/Redis with no `PRODUCTHUNT_*` vars set → clean container boot; manual ingest → `producthunt` row present with `fetched: 0` and `error: "producthunt not configured (PRODUCTHUNT_CLIENT_ID/PRODUCTHUNT_CLIENT_SECRET unset)"` in run history
- [x] 5.3 With real registered credentials (app registered by the user at producthunt.com, id/secret added to `backend/.env`): manual ingest against live Atlas/Redis → `producthunt` `fetched: 20, stored: 20`. Spot-checked 3 stored items: enriched `"<name> — <tagline>"` titles (e.g. `"Graft AI — Turn company operations into a living map for agents"`), real `published_at` from `createdAt`, non-zero `raw_points`/`raw_comments` (e.g. 115/27).
- [x] 5.4 Ran ingestion a second time → `producthunt` `fetched: 20, deduped: 20, stored: 0` (all 20 previously-stored launches hash-deduped, nothing re-stored). Confirmed token reuse directly via `redis-cli TTL producthunt:app_token`: 86352s after run 1, 86313s after run 2 — the TTL decreased naturally rather than resetting to 86400, proving `getAppToken()` found the cached token and made no new token request.
