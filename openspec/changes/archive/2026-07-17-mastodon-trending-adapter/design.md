## Context

The adapter registry (`adapters/index.ts`) is a static array of `{ source, fetch }` entries; adding a source is one new file plus one registry line, and run-history observability (summaries, `IngestionRun` docs, zero-streak alerting, Admin UI) picks up any new `source` label automatically via `unionSourceKeys` — no plumbing needed. Two existing adapters set the precedent this change follows: `reddit.ts` throws a descriptive `"<source> not configured (…)"` error when required config is absent (rather than resolving to an empty array), so an intentionally-disabled source is distinguishable in run history from one that's silently broken; `githubTrending.ts` uses `Promise.allSettled` across independent sub-requests and only throws when everything failed and nothing was produced.

Mastodon's public `/api/v1/trends/links` endpoint (no auth) returns each trending link with a `history` array of daily usage buckets; `history[0]` is today's bucket, with `accounts` (distinct sharers) and `uses` (total shares) both returned **as strings**, a known API quirk. There is no per-item timestamp — the endpoint returns "what's trending now," not "when was this shared."

## Goals / Non-Goals

**Goals:**
- Fetch and merge trending links across one or more configured Mastodon instances into `RawNewsItem`s.
- Default-enabled with zero required configuration (unlike Reddit/Product Hunt, no credentials exist to gate on) while still letting an operator disable it via an empty env var.
- Isolate per-instance failures so one unreachable instance doesn't blank out the whole source.
- Produce a fetch-time `published_at` so items participate in freshness filtering and the semantic-dedup recent pool, per the pipeline-wide rule that undated items silently escape both.

**Non-Goals:**
- No per-instance source labels (e.g. `mastodon:mastodon.social`) — a single flat `mastodon` label is used; per-instance labeling would fragment identity for what is conceptually one source and buys nothing for health monitoring, since instance failures are still logged individually.
- No rate limiting or backoff logic — at one request per configured instance per run (8 runs/day), usage is trivially inside Mastodon's public 300 req/5 min per-instance limit.
- No change to `content_hash` semantics, `RawNewsItem`'s shape, or any other adapter.

## Decisions

1. **Default-enabled with a sensible instance list**, unlike credential-gated sources. `NEWS_INGESTION_MASTODON_INSTANCES` defaults to `mastodon.social,fosstodon.org` (one large general instance, one tech-focused instance, for complementary coverage) so the server boots with a working adapter out of the box — matching the HN/dev.to precedent of "no env var needed to get a working default," while still allowing an operator to swap instances or disable entirely by setting the var to an empty string.
2. **Config parsing mirrors `rss_feeds` exactly**: `(env.NEWS_INGESTION_MASTODON_INSTANCES ?? '').split(',').map((s) => s.trim()).filter(Boolean)`, exported as `news_ingestion.mastodon_instances`. Reusing the established split/trim/filter idiom rather than inventing a new one keeps config parsing consistent across the module.
3. **Empty instance list → throw, not empty success.** Mirrors `reddit.ts`'s unconfigured-credential pattern: `if (mastodon_instances.length === 0) throw new Error('mastodon not configured (NEWS_INGESTION_MASTODON_INSTANCES is empty)')` before any network call. This keeps "deliberately disabled" distinguishable from "broken" in run history, and the zero-streak alerting won't fire for a source the operator explicitly turned off (same reasoning `reddit.ts` already established when Reddit credentials are absent — an unconfigured source still appears in the run-history union but with an honest, non-alerting-worthy error).
4. **Cross-instance merge is keyed by link URL**, keeping the copy with the higher `accounts` count when the same URL trends on multiple instances — a story genuinely more shared should keep its larger number rather than an arbitrary "last instance wins."
5. **`source_id` = the link URL itself.** The trending-links API has no id field for a trending entry (unlike a toot id); the URL is the only stable identifier, and it's already the value `content_hash` hashes on, so no separate scheme is introduced.
6. **Field mapping**: `title` = card `title`; `snippet` = card `description` (the API's own docs say plain text, but it's run through the existing `stripHtml` helper defensively, matching how other adapters treat nominally-plain-but-untrusted text fields); `raw_points = Number(history?.[0]?.accounts ?? 0)`; `raw_comments = 0` (no comment concept for a shared link); `raw_stars_delta = 0`.
7. **Per-instance catch via `Promise.allSettled`**, mirroring `githubTrending.ts`'s multi-endpoint pattern: one instance down still lets the others contribute; the adapter throws only when every instance's fetch failed (join the reasons into one error message, same as the GitHub adapter's merge-failure message).
8. **`published_at: new Date()` at fetch time**, not left `undefined`. The alternative — omitting it because the API provides no per-item date — was explicitly rejected: `filterFresh` treats undated items as always-fresh (fine on its own) but `fetchRecentEmbeddings`'s recent-pool query filters on `published_at >= cutoff`, so an undated item would never enter the semantic-dedup pool and could never be deduped against by a later run. Fetch-time is an honest signal for "trending now," and re-fetches of the same URL on later runs still hash-dedupe regardless of the timestamp drifting forward each run.

## Risks / Trade-offs

- **[Risk] `Number()` coercion silently produces `NaN` if the API ever omits or reshapes the `accounts` field**, which would poison `trend_score`'s downstream log-scale math with `NaN` opportunity scores for every Mastodon item in that run → **Mitigation**: default to `0` via `?? 0` before coercion (`Number(history?.[0]?.accounts ?? 0)`), and cover this in the adapter's unit tests (string→number coercion is an explicit test case per the parent plan).
- **[Risk] A small instance can legitimately return an empty trending-links list** (not an error) → **Mitigation**: treat a successful empty response as zero items, not a failure; only a fetch/parse error counts toward the all-instances-failed throw condition.
- **[Risk] Fetch-time `published_at` means the same URL re-fetched on a later run gets a newer timestamp each time**, which could theoretically let a very slowly-drifting duplicate re-enter the freshness window repeatedly → **Mitigation**: irrelevant in practice — `content_hash` (source + URL) makes any re-fetch of the same URL hash-dedupe against the already-stored copy before freshness or semantic dedup is even reached, so the timestamp drift never causes a second copy to be stored.

## Open Questions

None — the disable/enable behavior, merge key, and engagement mapping are fully specified by the parent plan and the existing reddit/githubTrending adapter conventions.
