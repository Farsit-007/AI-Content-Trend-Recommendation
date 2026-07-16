## Why

The RSS adapter is live with per-feed hostname labeling and per-feed failure isolation, but only carries 8 starter feeds. The catalog's Tier-3 editorial sources, GitHub Releases Atom feeds (version-release stories for widely-used developer tools), and an arXiv cs.AI Atom query all parse through the existing adapter with zero code changes — they ship as pure feed-list configuration. Separately, the adapter still constructs its `rss-parser` instance with no timeout, so one hung feed stalls the entire adapter's `Promise.all` indefinitely; the per-feed catch that already isolates a *failed* feed can't help if the feed just never responds.

## What Changes

- Construct `rss-parser` with a 10-second timeout (`new Parser({ timeout: 10_000 })`, `adapters/rss.ts:6`) so a hung feed times out and fails only itself — the existing per-feed catch already turns that into an isolated, logged failure rather than a stalled run.
- Expand the curated feed list (documented in `backend/.env.example`, applied by the operator to `backend/.env`) from 8 to 21 feeds: the existing 8 + 7 editorial/engineering feeds (InfoQ, The New Stack, Smashing Magazine, Stack Overflow Blog, Cloudflare Blog, The Changelog, MIT Technology Review) + 5 GitHub Releases Atom feeds for watched tools (react, next.js, node, typescript, tailwindcss) + 1 arXiv cs.AI Atom query.
- Document the ≤25-feed cost guardrail and the per-label zero-streak alert semantics directly alongside the env var, plus a code comment recording that conditional GET (HTTP 304) support is deliberately not implemented (see design.md decision 1).

**Capabilities:** MODIFIED `news-ingestion` (RSS operational requirement — timeout behavior and documented feed coverage).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: the RSS adapter requirement is modified to require a 10-second per-feed timeout and to document a curated, capped (≤25) feed list spanning editorial press, engineering blogs, GitHub release feeds, and an arXiv query.

## Impact

- `backend/src/app/modules/NewsIngestion/adapters/rss.ts` — one-line `Parser` constructor change, plus a code comment.
- `backend/.env.example` — replace the `NEWS_INGESTION_RSS_FEEDS` example value with the 21-feed list and expand its documentation.
- `backend/.env` (operator's local file, gitignored) — apply the same 21-feed list.
- Test: extend the existing `newsIngestion.rss.test.ts` to assert the parser is constructed with a timeout.
- No schema changes, no new module, no frontend changes — new `rss:<hostname>` labels (e.g. `rss:github.com`, `rss:export.arxiv.org`, `rss:thenewstack.io`) flow into run-history summaries and the Admin UI automatically via the existing `unionSourceKeys` mechanism.
