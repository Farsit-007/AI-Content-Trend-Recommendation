## Context

This is the third adapter (after Lobsters and GitHub Trending) to rely on `adapters/htmlText.ts`'s `decodeEntities` helper — Stack Exchange's API returns titles with HTML entities encoded (`&quot;`, `&#39;`, `&amp;`, …) rather than plain text, and leaving them undecoded would pollute both the feed UI and the embedding text fed into relevance scoring. No new HTML-handling code is needed; this is a pure reuse of an already-extracted, already-tested helper.

The Stack Exchange API's hot-questions endpoint (`/2.3/questions?sort=hot`) ranks by a time-decayed activity score, not recency — a question can be "hot" while being days old. This pipeline's existing `filterFresh` (72h default window) will legitimately drop older hot questions; that's correct, expected behavior per the pipeline's baseline rule that `published_at` must always reflect the item's real timestamp, never be faked to dodge the freshness filter. The response also carries an optional `backoff` field (seconds to wait before the next request) as a politeness signal — at this pipeline's call volume (one request per run, 8 runs/day) it will essentially never be populated, but a correct adapter still needs to not misuse it (i.e., never turn it into a `sleep()` inside the adapter, which would block the whole ingestion run for an unrelated reason).

## Goals / Non-Goals

**Goals:**
- Fetch the Stack Overflow site's hot-questions list once per run, keyless by default, with an optional API key to raise quota.
- Correctly decode HTML-entity-encoded titles via the existing `htmlText.ts` helper.
- Map tags (not question bodies) to the snippet — compact, on-topic embedding signal without the quota/noise cost of fetching bodies.
- Treat a Stack Exchange API-level error (`error_id`/`error_message` in the JSON body) as a real failure.

**Non-Goals:**
- No question-body fetching (would require the `filter` parameter to include `body`, extra response size, and answers no clear need — tags already carry the topic signal this pipeline uses).
- No `backoff` compliance logic (sleep/retry-after) — logged only, per the "never sleep-loop in an adapter" convention already established for this pipeline.
- No change to `content_hash` semantics, `RawNewsItem`'s shape, or `filterFresh`'s behavior — a hot-but-old question being dropped by freshness filtering is correct, not a bug to special-case around.

## Decisions

1. **Titles are entity-decoded via the existing `htmlText.ts` `decodeEntities`, not a new implementation.** The helper already exists (extracted by the `lobsters-adapter` change specifically so multiple adapters could share it) and is already unit-tested against GitHub Trending's and Lobsters' HTML-adjacent fields; this is the third and expected reuse, not a one-off.
2. **Snippet = tags, not question body.** The default Stack Exchange response filter doesn't include the question body — fetching it would require a different `filter` parameter, larger responses, and quota headroom this pipeline doesn't need for a compact "javascript, react, hooks"-style tag string, which is already high-signal, on-topic embedding text (the same "compact enrichment beats verbose scraping" philosophy `githubTrending.ts`'s title enrichment established).
3. **Hot ≠ new is left uncorrected, deliberately.** A hot question can be days old; `filterFresh` will legitimately drop it. The alternative — backdating or faking `published_at` to keep old-but-hot questions alive — is explicitly rejected because it violates the pipeline-wide rule that `published_at` must always be the item's honest real timestamp (baseline rule established across every prior adapter in this plan; violating it here would also make these items silently ineligible for the semantic-dedup recent pool in a way that's hard to debug later).
4. **No manual gzip handling.** Node's built-in `fetch` transparently decompresses gzipped responses (Stack Exchange always gzips), so no `Content-Encoding` handling is added — this is called out explicitly because it's a common carried-over habit from older `request`/`axios`-era Stack Overflow answers that no longer applies.
5. **API-level errors detected by response shape, not just HTTP status.** Stack Exchange can return a 400 with `{ error_id, error_message }`, but the check is: throw whenever `items` is missing/not an array, surfacing `error_message` when present — this catches both a clearly-erroring non-200 response and any other malformed-body case uniformly, rather than trusting `res.ok` alone.
6. **`backoff` is logged as a warning only.** At 8 requests/day this pipeline is nowhere near Stack Exchange's throttle threshold; a `backoff` value appearing would be a genuine anomaly worth a log line for a human to investigate, not something the adapter should ever act on by sleeping (sleeping inside an adapter would block that adapter's slot in the `Promise.all` across all adapters, a real regression for every other source in the same run).

## Risks / Trade-offs

- **[Risk] Shared IP quota**: the 300 req/day unauthenticated quota is per-IP, shared with anything else running on the same host/network — if verification shows unexpectedly low `quota_remaining`, something else is consuming it → **Mitigation**: `STACKEXCHANGE_KEY` is the correct fix (raises to 10k/day) rather than any adapter-side change; documented directly in `.env.example` so this is the obvious next step if it comes up.
- **[Risk] Titles arriving already-decoded or double-encoded** in some edge case → **Mitigation**: `decodeEntities`'s existing implementation is idempotent-safe for the common entity set (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) and already covered by existing tests from its GitHub Trending/Lobsters usage; no new risk introduced by a third caller.
- **[Risk] Most hot questions being older than 72h could make this source look artificially "dead"** in the freshness-filtered summary on any given run → **Mitigation**: this is expected, documented behavior (decision 3) — verification explicitly checks for `fresh_dropped` items as a sign the adapter is working correctly, not broken.

## Migration Plan

- No data migration — purely additive new source, no existing `content_hash` values or adapters touched.
- **Rollout**: works with zero configuration (keyless); `STACKEXCHANGE_KEY` is an optional day-two quota upgrade the operator can add any time without a deploy.
- **Rollback**: remove the registry entry — trivially reversible, no stored-data implications since `stackoverflow` items are labeled distinctly and don't interact with any other source's identity.

## Open Questions

None — the field mapping, error-detection rule, and freshness-filter interaction are all fully specified by the parent plan and existing pipeline conventions.
