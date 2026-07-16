# News Ingestion Pipeline — Deep Analysis & Production Remediation Plan

**Date:** 2026-07-16
**Scope:** Full analysis of the four reported problems in the Growth Studio news ingestion pipeline, with verified root causes, production-grade remediation plans, and caveats.

This is the **master document**. Each problem area has a dedicated deep-dive:

| # | Problem (as reported) | Deep-dive document |
|---|---|---|
| 1 | RAVI-No news from Reddit / RSS; very rare from GitHub Trending, dev.to; Medium missing | [NEWS-PIPELINE-SOURCES.md](./NEWS-PIPELINE-SOURCES.md) |
| 2 | FARSIT-Add more open-source news platforms | [NEWS-PIPELINE-SOURCES.md](./NEWS-PIPELINE-SOURCES.md) (Part B) |
| 3 | FARSIT-Delete old / out-of-trend news within 3–4 days to keep DB clean | [NEWS-PIPELINE-RETENTION.md](./NEWS-PIPELINE-RETENTION.md) |
| 4 | FARSIT-Progressive-trend stories wrongly dropped as duplicates ("Fable released" → "Fable banned" → "Fable public again") | [NEWS-PIPELINE-DEDUP-UPDATES.md](./NEWS-PIPELINE-DEDUP-UPDATES.md) |

---

## 1. How the pipeline works today (baseline)

All code lives in `backend/src/app/modules/NewsIngestion/`. The cron scheduler (`backend/src/app/lib/scheduler.ts`) runs `runIngestionPipeline()` every 3 hours by default (`NEWS_INGESTION_CRON=0 */3 * * *`). The pipeline (`newsIngestion.service.ts`) has four layers:

```
Layer 1  Fetch & Normalize      runAllAdapters() — 5 adapters: hackernews, devto,
                                github_trending, reddit, rss (adapters/index.ts)
Layer 2  Dedupe & Freshness     content_hash = sha256(source:url)  → drop if already stored
                                filterFresh() → drop if published_at older than
                                NEWS_INGESTION_MAX_AGE_HOURS (default 72h)
Layer 2b Semantic Dedup         embed(title+snippet) → drop if cosine ≥ 0.88 vs
                                (a) recently stored items, (b) accepted items this run
Layer 3  Relevance & Trend      max-cosine vs pooled brand-voice embeddings × 10;
                                drop if < NEWS_INGESTION_MIN_RELEVANCE (default 4.0)
                                trend_score = log10(points + 2·comments + 3·stars + 1) × 3
Layer 4  Categorize & Store     LLM categorization (batches of 10), opportunity score,
                                insertMany into news_items
```

Key structural facts that drive every problem below:

- **An item is written once and never touched again.** Engagement counts, trend_score, everything is frozen at ingest time (`newsIngestion.service.ts:86-108`).
- **Nothing is ever deleted.** There is no TTL index, no cleanup job — only a manual per-item admin delete endpoint (`newsItem.service.ts:124`).
- **Every filter drops silently.** Adapter failures, freshness drops, hash-dedup drops, semantic drops, and relevance drops are at best a pino log line. There is no persisted run history, no per-source health signal, no alerting.

---

## 2. Root-cause matrix (every cause verified in code or by live test on 2026-07-16)

| Symptom | Verified root cause | Evidence | Fix (doc) |
|---|---|---|---|
| **RSS: zero items, always** | `NEWS_INGESTION_RSS_FEEDS` is optional and set **nowhere** — not in `backend/.env`, not in `.env.example`. The adapter iterates an empty array. | `config/index.ts:70,181-184`; grep of both env files returns no `NEWS_*` vars | Sources §A.4 |
| **Medium: never appears** | There is no Medium adapter at all. Medium content could only arrive via RSS feeds — which are empty (above). | `adapters/index.ts:9-15` lists all 5 adapters | Sources §A.4, §B |
| **Reddit: zero items** | Unauthenticated `www.reddit.com/r/<sub>/top.json` now returns **HTTP 403** — Reddit blocks non-OAuth scripted clients. The error is caught, logged, and the run continues with 0 Reddit items. | Live curl from this machine on 2026-07-16 with the adapter's exact User-Agent: `403`. `adapters/reddit.ts:22-25` | Sources §A.1 |
| **dev.to: very rare items** | Adapter fetches `?top=7` = top of the **last 7 days**, but `filterFresh` discards anything older than **72 h**. Live check: the current top article was published 2026-07-09 — 7 days old. The few that survive are then hash-deduped on every subsequent run because the weekly top list barely changes. | `adapters/devto.ts:14`; `newsIngestion.utils.ts:21-24`; live API response | Sources §A.2 |
| **GitHub Trending: very rare items** | Two compounding causes: (a) HTML-regex scraping that fails soft to 0 items when GitHub changes markup; (b) **dedup starvation** — a repo trends for days, but its `content_hash` (source+URL) is stored once forever, so every later run drops it. Only brand-new entrants survive, then most die at the relevance filter because a bare `owner/repo` title has weak embedding similarity to brand-voice examples. | `adapters/githubTrending.ts:3-10` (self-documented brittleness); `newsIngestion.utils.ts:14-15,30-43` | Sources §A.3, Dedup doc §5 |
| **Cross-cutting: sources "die" and nobody notices** | No persisted ingestion-run history, no per-source zero-item alerting. A source can 403 for weeks invisibly (Reddit demonstrably has). | `adapters/index.ts:23-27` catches and swallows; grep confirms no `IngestionRun` model | Sources §C |
| **Cross-cutting: silent relevance kill** | Once any team has brand-voice examples, every item needs max-cosine ≥ 0.4 vs the pooled examples. Items from generic-tech sources (Reddit r/technology, GitHub repo names) often score below this and are silently discarded — indistinguishable from "the source returned nothing." | `newsIngestion.service.ts:71-75`; `newsIngestion.scoring.ts:17-21` | Sources §C.3 |
| **DB grows forever; stale items pollute feed** | No retention of any kind; `trend_score` frozen at ingest so "out of trend" is *undetectable* with current data. | grep: no `deleteMany`/TTL on `news_items`; `newsIngestion.service.ts` never updates | Retention doc |
| **Progressive updates dropped as duplicates** | `dedupeSemantic` unconditionally drops any candidate with cosine ≥ 0.88 vs items stored in the last 72 h. Follow-up stories about the same subject ("Fable banned", "Fable restored") land in the 0.88–0.97 band and die. The threshold **cannot** be tuned out: live calibration showed genuine cross-source duplicates score ~0.899 — the duplicate band and the update band overlap. | `newsIngestion.utils.ts:58-82`; calibration history in `openspec/changes/filter-pipeline/design.md` + `scripts/verifySemanticDedupLive.ts` | Dedup doc |

---

## 3. How the four problems interlock (read this before implementing anything)

These are not four independent bugs. They form a dependency graph, and fixing them in the wrong order creates new production bugs:

```
                ┌─────────────────────────┐
                │ Engagement re-polling    │  (Retention doc §3)
                │ (re-fetch points/comments│
                │  for stored items)       │
                └───────┬─────────┬───────┘
                        │         │
          enables       │         │  enables
                        ▼         ▼
        ┌───────────────────┐   ┌────────────────────────┐
        │ Trend decay →      │   │ Story-chain trend       │
        │ "out of trend"     │   │ refresh (update-aware   │
        │ detection → delete │   │ dedup keeps story alive)│
        └─────────┬─────────┘   └───────────┬────────────┘
                  │                          │
                  ▼                          │
        ┌───────────────────┐               │
        │ Deletion needs a   │◄──────────────┘
        │ dedup tombstone    │   (deleting an item whose story is still
        │ ledger, or deleted │    evolving must not resurrect old chapters)
        │ items resurrect    │
        └───────────────────┘
```

Three concrete interlocks:

1. **Retention depends on engagement re-polling.** "Delete when out of trend" is impossible today because trend data is a snapshot from ingest time. You must first re-poll engagement (HN, Reddit-OAuth, dev.to all support re-fetch by ID) and compute a *decayed* trend score. Deleting on the frozen score would delete items that are still rising and keep items that died an hour after ingest.
2. **Retention depends on a dedup ledger.** `content_hash` uniqueness is what stops re-ingestion. Delete the row, and the same URL comes back on the next run — *guaranteed* for GitHub Trending items, which have `published_at: undefined` and therefore bypass the freshness filter entirely (`newsIngestion.utils.ts:23` treats missing dates as fresh; `fetchRecentEmbeddings` at `:47` also excludes them from the semantic pool because it filters on `published_at: { $gte: cutoff }`). A deleted-hash tombstone ledger is mandatory before any hard delete ships.
3. **Update-aware dedup depends on story linking, which retention must respect.** Once follow-up stories are chained (`story_id`), retention must age out *stories*, not individual rows — deleting chapter 1 of a live story breaks the timeline the feed shows, and deleting the stored item that a gray-band candidate would be compared against degrades update adjudication.

**Conclusion: implement in the phased order below. Do not ship retention before the tombstone ledger and engagement re-polling. Do not ship update-aware dedup before observability (you need discard-reason data to calibrate the bands).**

---

## 4. Phased roadmap

### Phase 0 — Config & quick wins (hours; unblocks 3 of 5 sources)
No schema changes, no new code paths. Details: Sources doc §A.

| Step | Change | Effort |
|---|---|---|
| 0.1 | Populate `NEWS_INGESTION_RSS_FEEDS` in `.env` **and** `.env.example` with the curated starter list (includes Medium tag feeds → instantly solves "Medium missing") | 15 min |
| 0.2 | dev.to: switch to `?top=1&per_page=50` (+ a second `state=rising` call) so the fetch window matches the 72 h freshness window | 30 min |
| 0.3 | Hacker News: optional switch to the Algolia front-page API (1 request instead of 31) | 1 h |
| 0.4 | Document every `NEWS_INGESTION_*` env var in `.env.example` (they are entirely undocumented today — root cause of 0.1) | 30 min |

### Phase 1 — Observability + source hardening (1–2 days; prerequisite for everything after)
Details: Sources doc §C.

- 1.1 Persist an `IngestionRun` document per run: per-source `{fetched, freshness_dropped, hash_deduped, semantic_deduped, relevance_dropped, stored, error}` + timings.
- 1.2 Admin endpoint `GET /news-ingestion/runs` + surface in the dashboard Admin page.
- 1.3 Alert rule: source returned 0 fetched items for N (default 3) consecutive runs → flag in admin UI / notification.
- 1.4 Reddit OAuth adapter (script-app credentials, token caching, `oauth.reddit.com`). Requires one-time Reddit app registration — see caveats in Sources §A.1.
- 1.5 GitHub Trending: keep the scrape but wire its zero-result soft failure into 1.3; add the API-based fallback described in Sources §A.3.
- 1.6 Per-feed source labeling for RSS (`rss:techcrunch.com` instead of flat `rss`) so per-source health is meaningful.

### Phase 2 — New sources (1–2 days, incremental per source)
Details: Sources doc §B. Priority order: Lobsters → HN Algolia (if not done in 0.3) → Medium/publisher RSS expansion → Google News RSS queries → Mastodon trending → Product Hunt → arXiv → GitHub Releases feeds.

### Phase 3 — Engagement re-polling + trend decay (2–3 days)
Details: Retention doc §3–4.

- 3.1 `refreshEngagement` job (own cron, e.g. hourly): re-fetch engagement for items < 96 h old from sources that support it; store `engagement_history` snapshots.
- 3.2 Compute `current_trend_score` with exponential time decay + velocity (Δ engagement between snapshots).
- 3.3 Feed sorts on the decayed score → stale items sink immediately even before deletion ships.

### Phase 4 — Retention lifecycle (2–3 days; requires Phases 1 & 3)
Details: Retention doc §5–7.

- 4.1 `DedupLedger` tombstone collection (content_hash + embedding, 30-day TTL).
- 4.2 Lifecycle field on `news_items`: `active → archived → (hard-deleted)`; archive at 3–4 days *or* decayed-trend floor; hard-delete archived items after 14 days.
- 4.3 Cleanup cascade: category overrides, Redis caches, feed-query exclusion of archived items.

### Phase 5 — Update-aware dedup + story chains (3–4 days; requires Phase 1 calibration data)
Details: Dedup doc.

- 5.1 Two-band semantic dedup: ≥ 0.97 hard duplicate (merge engagement); 0.88–0.97 gray band → batched LLM adjudication (`duplicate | update | distinct`).
- 5.2 `story_id` chains for `update` verdicts; feed shows story timeline; story-level trend keeps live stories out of retention's reach.
- 5.3 Recalibrate bands with `verifySemanticDedupLive.ts` extended with hand-built update-vs-duplicate pairs.

---

## 5. Global caveats & production-readiness checklist

**Caveats that apply across all four fixes:**

1. **Windows/local vs production network behavior differs.** Reddit's 403 was reproduced from this dev machine (residential IP); datacenter IPs are blocked *more* aggressively, never less. Any source that works locally must be re-verified from the production host before being declared healthy — this is exactly what the Phase 1 run-history makes visible.
2. **All timestamps must be UTC.** `filterFresh`, decay math, and retention cutoffs all do epoch arithmetic — safe today, but any future change that formats/parses local dates (server TZ vs Atlas TZ) will silently shift the 72 h window. Keep everything `Date.now()`-based.
3. **Embedding-model coupling.** Semantic-dedup thresholds (0.88 / proposed 0.97) are calibrated to `openai/text-embedding-3-small` (1536-dim, enforced by `newsItem.model.ts:21-28`). Changing `EMBEDDING_MODEL` invalidates the thresholds *and* makes old/new embeddings incomparable in the dedup pool. If the model ever changes: wipe or re-embed the pool and re-run `npm run verify:semantic-dedup-live`.
4. **LLM cost & failure discipline.** Phases 4–5 add LLM calls (gray-band adjudication) and API re-polling. Every new external call must follow the existing pattern: batched, failure → conservative fallback (keep + `needs_review: true`), never silently drop content on infrastructure failure (`newsIngestion.categorize.ts:22-28` is the model to copy).
5. **Single-process cron assumption.** `node-cron` schedules in-process (`scheduler.ts`). If the backend ever scales past one instance, every scheduled job (ingestion, refresh, retention) runs N times concurrently. The `insertMany ordered:false` + unique `content_hash` guard makes duplicate *ingestion* merely wasteful, but duplicate *deletion/adjudication* jobs are not idempotent by accident — add a Redis lock (`SET NX PX`) around each job body when adding Phases 3–5. (Redis is already a hard dependency.)
6. **ToS discipline for new sources.** Every source added in Phase 2 is documented with its ToS/robots posture in the Sources doc. Scraping-based sources (GitHub Trending HTML) must always fail soft and must never gain retry-hammering; API-based sources must respect published rate limits with backoff.

**Definition of done (production):**

- [ ] All 5 existing sources show non-zero `fetched` in the run history over a 24 h window (RSS/Reddit/dev.to currently: 0)
- [ ] Admin page shows per-source, per-layer counts for the last N runs; zero-streak alert fires in a controlled test (point Reddit adapter at an invalid subreddit)
- [ ] DB size stabilizes: `news_items` count plateaus under the retention policy; tombstone ledger prevents resurrection (test: delete a GitHub Trending item, re-run pipeline, confirm no re-insert)
- [ ] Progressive-update scenario passes end-to-end: ingest "X released", then feed a paraphrase (expect drop), then feed a genuine update (expect stored + chained) — automated in the extended live-verify script
- [ ] All new env vars documented in `.env.example` with safe defaults (server must boot with none of them set)
