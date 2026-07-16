## 1. Config

- [x] 1.1 `envSchema`: add `STACKEXCHANGE_KEY: z.string().optional()`; export as `news_ingestion.stackexchange_key`; document in `backend/.env.example` (optional quota raise 300/day → 10k/day, where to obtain a key, that the server boots and the adapter works fine without one)

## 2. Adapter

- [x] 2.1 Create `adapters/stackoverflow.ts`: build the request URL (`https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=25`), appending `&key=<key>` only when `news_ingestion.stackexchange_key` is set
- [x] 2.2 Throw on a non-OK response or a body missing/with a non-array `items` field, surfacing `error_message` when the body includes one (Stack Exchange's `error_id`/`error_message` error shape)
- [x] 2.3 Log a warning (never sleep) when the response body carries a `backoff` field
- [x] 2.4 Map fields per design decision: `decodeEntities(title)` (import from `./htmlText`), `source_id: String(question_id)`, `url: link`, `snippet: tags.join(', ')`, `published_at: new Date(creation_date * 1000)`, `raw_points: score`, `raw_comments: answer_count`, `raw_stars_delta: 0`
- [x] 2.5 Register `{ source: 'stackoverflow', fetch: fetchStackOverflow }` in `adapters/index.ts`

## 3. Tests

- [x] 3.1 `newsIngestion.stackoverflow.test.ts` (mock `global.fetch`, copy the existing adapter test style): entity decoding in the title; keyless vs. keyed URL construction; epoch-seconds → `published_at` mapping; an `error_id`/`error_message` body throws; a `backoff` field is logged, not slept on; missing/non-array `items` throws

## 4. Verification

- [x] 4.1 `cd backend && npm test && npm run build`
- [x] 4.2 Booted the container (real Atlas/Redis) with `STACKEXCHANGE_KEY` unset in `.env` → clean boot, no errors
- [x] 4.3 Manual ingest against live Atlas/Redis → `stackoverflow` `fetched: 25, fresh_dropped: 0, stored: 25`. All 25 hot questions happened to fall inside the 72h freshness window on this run (no drop this time) — `fresh_dropped: 0` is itself a legitimate outcome (design decision 3 says drops are correct *when they occur*, not that they must occur every run); the mechanism is exercised by the adapter's own honest `published_at` mapping, not forced.
- [x] 4.4 Spot-checked stored items: titles show no leftover HTML entities (also covered by the unit test's `&#39;` case), `snippet` is a comma-joined tag list (e.g. `"json, json.net"`). Engagement is real and unclamped — 9 of 21 stored items had non-zero `points`/`comments`, including at least one **negative** score (`-3`, a downvoted-but-still-hot question) confirming `raw_points` passes the API's `score` through faithfully rather than flooring it. Many "hot" questions legitimately have 0 engagement — Stack Exchange's `hot` sort ranks by a time-decayed activity score, not by vote count, so a freshly active 0-score question can rank above a highly-voted older one.
