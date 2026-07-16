## Context

### History: why this isn't Google News RSS

The original design targeted Google News's free, unauthenticated RSS search endpoint (`https://news.google.com/rss/search?q=...`), following the parent plan's original Change 7. That was fully implemented and live-verified — and failed the plan's own explicit exit gate. Google News RSS `<link>` values are `news.google.com/rss/articles/CBM…` URLs, never the publisher's real URL; the plan's design assumed these could be resolved to the real URL by following an HTTP redirect (`fetch(link, { redirect: 'follow' })`). Live verification against the real endpoint found this assumption no longer holds:

- A `redirect: 'manual'` probe of a real article link returned `302` with a `Location` header pointing back to **the same `news.google.com` host** (identical path, only locale query params appended) — not to any publisher domain.
- Following that redirect lands on a ~570KB Google-hosted interstitial page containing client-side JavaScript (`window.location`-based navigation) that performs the actual final navigation to the publisher. A headless `fetch()` cannot execute that JavaScript, so `response.url` after following redirects is still a `news.google.com` URL.
- This was confirmed systematic (not a one-off transient failure) by sampling multiple links across two unrelated topics — identical self-referential-redirect-then-JS-interstitial pattern every time.

Google has evidently moved from server-side redirects to a JS-rendered interstitial for these links at some point after the parent plan was written. The implemented adapter's canonicalization gate worked exactly as designed — it dropped every item rather than storing a `news.google.com` URL — but that meant the source degraded to zero items with no viable fix inside this pipeline's constraints (the only real fix, running a headless browser to execute the JS, is explicitly on this pipeline's excluded-techniques list). Two alternative undocumented-internal-API workarounds were considered and rejected for the same reason the original `CBM…`-id-decoding approach was already rejected: they'd depend on an unversioned, unofficial Google-internal endpoint that could break again without notice, reintroducing the exact fragility this design was built to avoid.

### The GNews.io replacement

GNews.io (`https://gnews.io/api/v4/search`) is an officially documented, versioned third-party news-search API. Its `articles[].url` field is the real publisher URL directly — there is no redirect layer, no canonicalization step, no interstitial. This removes the single riskiest piece of the original design entirely, at the cost of depending on a third-party service with its own (generous enough) free-tier quota: 100 requests/day, and this pipeline needs at most 3/run × 8 runs/day = 24.

## Goals / Non-Goals

**Goals:**
- Deliver per-topic news search coverage as an opt-in source, default-off (requires both an API key and configured topics).
- Map GNews.io results directly to `RawNewsItem` with zero URL transformation — the API's `url` field is already correct.
- Enforce the ≤3-query cap in code, matching every other multi-query adapter in this pipeline (Mastodon's instance list, the original Google News design).
- Fail per-query, not whole-adapter, on a single bad topic — matching the `Promise.allSettled` pattern already established by Mastodon and GitHub Trending.

**Non-Goals:**
- No redirect-following, no canonicalization, no interstitial-parsing — none of that machinery exists in this version; it's structurally impossible to store a wrong-domain URL here because the API never returns one.
- No pagination beyond `max=10` per topic — matches this pipeline's per-source item-volume conventions (dev.to, HN risers, Product Hunt all cap around 10-50/run).
- No change to `content_hash` semantics, `RawNewsItem`'s shape, or any other adapter.

## Decisions

1. **`source: 'gnews'`, not `'google_news'`.** The abandoned Google-RSS-based adapter never stored a single item (its canonicalization gate correctly dropped everything), so there is no existing `content_hash` backlog under the old label to preserve compatibility with — this is a clean rename, not a migration. Keeping the old label would have been actively misleading: this pipeline no longer talks to Google News in any form.
2. **Field mapping is direct, one-to-one**: `source_id`/`url`: `article.url`; `title`: `article.title`; `snippet`: `article.description`; `published_at: new Date(article.publishedAt)`; `raw_points: 0`, `raw_comments: 0`, `raw_stars_delta: 0` (GNews.io carries no engagement signal, same as every plain RSS-shaped item already in this pipeline).
3. **Both `GNEWS_API_KEY` and `NEWS_INGESTION_GNEWS_QUERIES` are required together** for the adapter to do anything — either being absent throws an unconfigured error naming which one is missing, before any network call (mirrors the Reddit/Product Hunt "not configured" pattern).
4. **≤3-query cap, enforced by `slice(0, 3)` plus a logged warning**, matching the original Google News design's own reasoning and the Mastodon-instances precedent: an operator pasting a long topic list must not silently balloon request volume.
5. **Per-query `Promise.allSettled`, throw only if every query failed** — identical pattern to Mastodon's per-instance and GitHub Trending's per-path handling, now applied to per-topic GNews.io queries.
6. **Non-OK responses (including GNews.io's documented 401/403 for an invalid or over-quota key) throw with the response body's error detail when present** — GNews.io returns a JSON `{ errors: [...] }` body on failure, checked and surfaced rather than a bare status code.

## Risks / Trade-offs

- **[Risk] Dependency on a third-party service's uptime and quota**, unlike every other free/official-first-party source in this pipeline → **Mitigation**: GNews.io is the source of truth here by design choice (traded the redirect-fragility risk for a service-dependency risk, which is far more observable — a quota/auth failure is an explicit HTTP status and JSON error body, not a silent structural break like the original approach); the pipeline's existing per-adapter error handling and zero-streak alerting already covers "this source stopped responding" regardless of cause.
- **[Risk] 100 requests/day shared across however many topics are configured** → **Mitigation**: the ≤3-query cap keeps this pipeline's usage at 24/day worst case, well inside budget; documented in `.env.example` alongside the var so a future operator adding more topics sees the ceiling.
- **[Risk] GNews.io's free tier could change terms or be discontinued** → **Mitigation**: same class of risk any external dependency carries; the adapter's unconfigured-guard means removing the key cleanly disables the source with an honest run-history reason, no code change required to roll back.

## Migration Plan

- No data migration — the abandoned `google_news`-labeled adapter never stored anything, so there's no backlog to reconcile. This is a clean swap: delete `adapters/googleNews.ts`, add `adapters/gnews.ts`, update the registry entry and config.
- **Rollout**: operator signs up at gnews.io (free), sets `GNEWS_API_KEY` and `NEWS_INGESTION_GNEWS_QUERIES` in `backend/.env`; activates on the next run, no further deploy needed.
- **Rollback**: unset either var — the adapter reports itself unconfigured, zero cost, zero code change.

## Open Questions

None — the field mapping and failure handling are fully specified by GNews.io's documented API shape and this pipeline's existing multi-query adapter conventions (Mastodon, GitHub Trending).
