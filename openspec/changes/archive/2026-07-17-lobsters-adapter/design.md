## Context

The ingestion pipeline (`backend/src/app/modules/NewsIngestion/`) runs a static array of adapters (`adapters/index.ts`), each returning `RawNewsItem[]` or throwing. Run-history observability (per-run, per-source, per-layer counts, zero-streak alerting, Admin UI) already unions whatever source labels adapters emit — adding a source requires zero observability plumbing. Two reference patterns already exist in-repo: `githubTrending.ts` (multi-endpoint merge, `Promise.allSettled`, throw-only-if-nothing-and-error) and `reddit.ts` (credential-gated, throws a descriptive "not configured" error). Lobsters needs neither — it is a single unauthenticated endpoint — so it follows a simpler single-call pattern: one fetch, throw straight through on failure.

The GitHub adapter privately implements HTML entity-decode and tag-strip helpers (`githubTrending.ts:18-25`, `:45`) that Lobsters' HTML `description` field also needs. This is the first time a second adapter needs that logic, so it is the right moment to extract it into a shared module rather than duplicating it.

## Goals / Non-Goals

**Goals:**
- Add a `lobsters` adapter that fetches `https://lobste.rs/hottest.json` once per run and normalizes stories to `RawNewsItem`, preserving real engagement (`score`, `comment_count`) and real timestamps.
- Extract `decodeEntities`/`stripHtml` into `adapters/htmlText.ts` so both GitHub and Lobsters (and later Change 2 / Change 6) share one implementation, with zero behavior change to the existing GitHub adapter.
- Keep the adapter credential-free and env-var-free — the server must boot identically before and after this change.

**Non-Goals:**
- Not fetching `newest.json` (unmoderated firehose, would mostly die at the relevance filter while still costing embeddings — revisit only if run history later shows `stored ≈ 0` while `fetched > 0` on the hottest feed).
- Not adding a URL-configuration env var for the endpoint (YAGNI — no other credential-free single-endpoint adapter has one).
- Not adding partial-result/multi-endpoint merge machinery — Lobsters is one endpoint, so a failure is a full failure.

## Decisions

1. **`hottest.json` only.** Hottest is community quality-ranked; `newest.json` is unmoderated. Taking only hottest keeps signal-to-noise (and embedding cost) favorable. Alternative considered: fetch both and merge — rejected as unnecessary cost for a Tier-1 "ship first" change; can be revisited later if coverage looks thin.

2. **Field mapping** (Lobsters story object → `RawNewsItem`):
   - `source: 'lobsters'`
   - `source_id: short_id`
   - `title: title`
   - `url: url || comments_url` (Lobsters text posts have `url: ""`)
   - `snippet`: tag-stripped + entity-decoded `description`, truncated to 500 chars (mirrors Reddit's `selftext.slice(0, 500)`); when `description` is empty, fall back to the story's `tags` joined as plain words (cheap extra relevance-filter signal, same motivation as GitHub title enrichment)
   - `published_at: new Date(created_at)`
   - `raw_points: score`
   - `raw_comments: comment_count`
   - `raw_stars_delta: 0`

3. **Failure is all-or-nothing.** Single endpoint, single call: a non-OK response or fetch error throws directly. The adapter registry (`runAllAdapters`) already catches a thrown adapter error into that run's `AdapterResult.error`, which surfaces in run history — no adapter-local partial-result handling is needed, unlike `githubTrending.ts` or `mastodon.ts` (Change 3).

4. **Helper extraction is mechanical, not a rewrite.** `adapters/htmlText.ts` exports `decodeEntities(text: string)` and `stripHtml(html: string)` with the exact current implementations lifted from `githubTrending.ts:18-25` and the inline `replace(/<[^>]+>/g, '')` at `:45`. `githubTrending.ts` imports them; its existing test (`newsIngestion.githubTrending.test.ts`) is the regression guard — it must pass unmodified after the refactor.

5. **User-Agent discipline.** The Lobsters fetch sends a `GrowthStudioBot/1.0`-style `User-Agent` header, consistent with the plan's global adapter checklist (item 5), even though the endpoint is unauthenticated and has no documented UA requirement.

## Risks / Trade-offs

- **[Risk]** Lobsters' `hottest.json` shape could change without notice (no versioned API contract) → **Mitigation**: single-call, throw-on-anomaly design means a shape change surfaces immediately as a run-history error for `lobsters`, not silent data corruption; unit tests pin the expected shape.
- **[Risk]** Refactoring `githubTrending.ts` to import shared helpers could subtly change GitHub adapter behavior → **Mitigation**: implementations are copied verbatim (not rewritten), and the existing GitHub test suite is run as a regression gate before this change is considered done.
- **[Risk]** `hottest.json` returning mostly items with empty `description` and empty `tags` would starve the relevance filter → **Mitigation**: monitor via run history (`stored` vs `fetched` for `lobsters`); no code change needed to detect this, only to act on it later.
