## 1. Script

- [x] 1.1 `backend/src/scripts/auditContentCoverage.ts`: connect via mongoose (DNS-fix pattern per existing `verify:*` scripts), aggregate per-source `content_status` counts/percentages and average `word_count` (present-only), sample up to 20 `none`/`failed` items (title/url/source), print via `console.table` + summary lines, `mongoose.disconnect()` + `process.exit(0)` — fixed a bug found during the live run: raw aggregation groups a missing `content_status` field under Mongo `null`, not the schema's `'none'` default, which silently hid ~1000 documents from the visible breakdown until coalesced via `$ifNull`
- [x] 1.2 Register `"audit:content-coverage": "ts-node src/scripts/auditContentCoverage.ts"` in `backend/package.json`

## 2. Live run & findings

- [x] 2.1 Run `npm run audit:content-coverage` against the real deployment's Atlas cluster (1323 documents, 21 sources)
- [x] 2.2 Record the actual per-source findings into `10-VISION-PLATFORM-OPS-AND-CONTENT-FIDELITY-OPENSPEC-PLAN.md`'s Track C section (full breakdown table + headline finding)
- [x] 2.3 Assess findings against the "likely candidate follow-ups" in design.md/plan file 10 — none of the three (GitHub Trending thin content, Mastodon/GNews paywall rate, `CONTENT_FACTS_MIN_CHARS=800` exclusion) turned out to be the real issue once measured against post-enrichment-feature items only. The real finding: content-fetch enrichment (commit `208b8fe`, 2026-07-17T18:14:50 UTC) works correctly today (live-verified against the exact URLs stored as `none` — TechCrunch/The Verge/GitHub README/arXiv all extracted successfully), but a large pre-existing backlog was ingested before that commit and never gets backfilled (no retroactive backfill, by design), so it permanently shows `content_status: none`.
- [x] 2.4 Real, data-backed gap found (the backlog, not the pipeline) — not fixed in this change; recorded as a candidate follow-up (a one-time backfill script) in the plan file instead

## 3. Verification

- [x] 3.1 `cd backend && npm run build` (clean) and `npm test` (418/418 passed, unaffected — no existing tests touch this new script)
- [x] 3.2 Confirmed zero writes: the script's only DB calls are `NewsItem.aggregate([...$group...])` and `NewsItem.find(...).limit(20).lean()` — no `updateOne`/`insertMany`/`deleteMany` anywhere in the script; live-verified during the investigation that ran two extra read-only diagnostic queries (also aggregate/find only) against the same collection with no observed side effects
