## Context

`adapters/rss.ts` fetches every configured feed URL in parallel via `Promise.all`, with each feed wrapped in its own `.catch()` that logs the failure and returns `[]` — one bad feed already can't take down the others. What it lacks is a *timeout*: `new Parser()` (`rss-parser`) is constructed with no options, so a feed that accepts the TCP connection but never sends a response (or streams indefinitely) leaves that `parseURL` call pending forever, which stalls the `Promise.all` the whole adapter run depends on — the per-feed catch never even gets a chance to fire because the promise never rejects.

Every RSS item is labeled `rss:<hostname>` via `feedLabel()`, which is also a `content_hash` input (hash = `sha256(source + ':' + url)`) — changing a feed's *hostname* would re-ingest everything under that feed as new, but changing the feed *path* on an already-used hostname does not, since the label only ever reflects the hostname. This is why five separate GitHub Releases Atom feeds (same hostname, different repo paths) safely share one label.

The catalog's Tier-3 selection already reduced the new feeds to those with stable RSS/Atom endpoints; the only per-item shape difference is that release feeds and the arXiv query carry no engagement numbers, which the adapter already handles today (`raw_points: 0`, etc. — every RSS item is currently mapped this way regardless of source).

## Goals / Non-Goals

**Goals:**
- Add a 10-second per-feed fetch timeout so a hung feed can only ever cost that one feed, never the whole run.
- Expand the documented feed list to 21 feeds (editorial press, engineering blogs, GitHub Releases, arXiv), all shipped as configuration — zero new adapter code.
- Keep the total feed count inside the ≤25-feed cost guardrail established by the parent plan (embedding + LLM-categorization cost scales with fetched-item volume).

**Non-Goals:**
- No conditional GET (HTTP 304) support — deliberately excluded; see decision 1.
- No change to `feedLabel`'s hostname-only labeling scheme, or to how `content_hash` is computed.
- No new adapter, no new module, no config schema change (`NEWS_INGESTION_RSS_FEEDS` already exists and is already a plain comma-separated string).

## Decisions

1. **Conditional GET is deliberately NOT implemented, and this must stay a documented decision, not a silent gap someone "helpfully" fixes later.** A feed correctly answering `304 Not Modified` would legitimately yield `fetched: 0` for that feed's label on a given run. The pipeline's existing zero-streak alert (3 consecutive zero-fetch runs triggers an alert) can't currently distinguish "quiet but healthy" (304, nothing new since last check) from "silently broken" (0 items, actually dead) — making 304 distinguishable requires plumbing a per-feed HTTP-status signal through `AdapterResult` into the `IngestionRun` schema, which is real cross-cutting scope for negligible payoff at ~200 requests/day total. Revisit only if the feed count grows past ~50 and 304 responses become common enough that this alerting blind spot starts producing false positives in practice. This decision is recorded as a comment directly above the `Parser` construction in `rss.ts` so the reasoning travels with the code.
2. **Five GitHub Releases feeds share one label, `rss:github.com`, by design.** Labels are hostname-derived; per-repo labeling would require extending `feedLabel` beyond hostname, which is explicitly out of bounds since the label is a `content_hash` input — changing labeling for existing sources re-ingests their entire backlog as duplicates (the plan's single most important "don't" for this change). The accepted trade-off: the five release feeds succeed or fail together as one health-monitored unit; an operator diagnosing a `rss:github.com` alert checks all five feeds, which is a minor, acceptable ambiguity next to the alternative risk.
3. **arXiv gets exactly one combined query, never one feed per category.** The arXiv API's usage policy caps requests at roughly one per 3 seconds; a single query per run (`cat:cs.AI`, newest, 25 results) is trivially compliant. If broader category coverage is ever wanted, the fix is widening the query (`cat:cs.AI+OR+cat:cs.LG`), not adding a second arXiv feed URL — this keeps arXiv's request count fixed at 1 regardless of how many categories are of interest.
4. **10 seconds, not a smaller or larger value, for the per-feed timeout.** Long enough that a normally-slow-but-healthy feed (e.g. a CDN cold cache) isn't falsely killed, short enough that even if every one of 21 feeds simultaneously hung, the adapter's total wall-clock cost is bounded (`Promise.all` runs them concurrently, so the worst case is ~10s, not 21×10s) — this bound is exactly why a timeout was worth adding in the first place, and why the value must not be raised casually without re-checking that assumption.
5. **Feed-list capacity accounting**: 8 existing + 7 editorial + 5 GitHub Releases + 1 arXiv = 21, leaving 4 feeds of headroom under the plan's ≤25 guardrail for future additions before the cost conversation needs revisiting.

## Risks / Trade-offs

- **[Risk] A feed silently going quiet via legitimate 304 responses could look identical to a dead feed in the zero-streak alert** (decision 1's accepted gap) → **Mitigation**: explicitly documented as an accepted trade-off, not an oversight, both in this design doc and as an in-code comment; revisit trigger (feed count > ~50) is specified so a future change knows exactly when to reconsider.
- **[Risk] Total fetched-item volume grows** with 13 new feeds (7 editorial + 5 releases + 1 arXiv), pushing the pipeline's per-run embedding/categorization cost upward → **Mitigation**: the parent plan's cost guardrail (total per-run fetched volume < ~400 items across all sources) is the ceiling to watch; this change alone adds at most 21 feeds × ~25 items/feed ≈ 525 theoretical max, but realistic overlap with the freshness filter and per-feed item counts (GitHub Releases feeds are low-frequency, arXiv is capped at 25 results) keeps the practical addition well under that. Verification includes an explicit check of total per-run fetched volume.
- **[Risk] A release feed or the arXiv feed has zero engagement signal** (`raw_points: 0`, same as today's existing RSS items), so these items compete on relevance alone → **Mitigation**: this is already how the RSS adapter treats every item today (no source-specific special-casing exists), and is the documented-correct behavior — a Tailwind release matters to a dev-focused brand voice regardless of vote counts, so no change is needed here, only awareness that it's intentional.

## Migration Plan

- No data migration — this is additive feed-list configuration plus a constructor-argument change. Existing feeds' `content_hash` values are untouched (their hostnames and paths don't change).
- **Rollout**: update `.env.example` (this change) and the operator's own `backend/.env` (manual step, since `.env` is gitignored) to the 21-feed list; the next scheduled or manual ingestion run picks up the new feeds automatically — no restart-order dependency beyond the normal env-var-read-at-boot behavior already true of every other `NEWS_INGESTION_*` var.
- **Rollback**: revert `.env`'s feed list to the original 8, and/or revert the `Parser({ timeout: 10_000 })` constructor change — both are trivially reversible with no stored-data implications.

## Open Questions

None — the feed list, timeout value, and conditional-GET exclusion are all fully specified by the parent plan's catalog research and cost-guardrail analysis.
