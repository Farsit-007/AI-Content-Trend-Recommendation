## Context

`newsIngestion.contentFetch.ts` enriches items still missing `content` after adapter-level capture, and
`newsIngestion.service.ts`'s `withContentMeta` caps stored content at `config.news_ingestion.content_max_chars`
(`NEWS_CONTENT_MAX_CHARS`, default 20000) and marks each item's `content_status` as `none`/`partial`/`full`/
`failed`. Content generation's fact-grounding step (`contentGeneration.facts.ts`, not touched by this change)
only fact-grounds when stored content is at least `config.content_generation.facts.min_chars`
(`CONTENT_FACTS_MIN_CHARS`, default 800), truncating input to `facts_input_max_chars`
(`CONTENT_FACTS_INPUT_MAX_CHARS`, default 12000) chars.

No one has queried the real, live `news_items` collection to see what fraction of stored items actually clear
that 800-char bar, or how `content_status` breaks down per source. Every prior content-fidelity change in this
plan (V7/V9, the `news-source-link-and-thumbnail-fields` change just shipped) has assumed content capture is
"good enough" without measuring it. This change closes that gap with a single, read-only reporting script — no
behavior change bundled in.

## Goals / Non-Goals

**Goals:**
- Ship a repeatable, read-only script that reports per-source `content_status` distribution, average
  `word_count`, and a sample of thin/failed items for manual spot-checking.
- Run it once against the real deployment as this change's own verification, and record the actual findings.
- Give any future content-pipeline tuning a real, data-backed starting point instead of a guess.

**Non-Goals:**
- No fix to any adapter, threshold, or enrichment logic in this change — findings only. A follow-up change is
  proposed separately if the data shows something worth fixing (per the user's own "audit first, fix real
  gaps" decision, plan file 10 §Track C inputs).
- No new scheduled/cron job — this is a one-off, manually-invoked script, run the same way every other
  `verify:*`/`db:*` script in `backend/src/scripts/` already is.
- No UI surface for the report — console output only, consistent with the existing `verify:*` script family.

## Decisions

### 1. Aggregation pipeline, not application-level iteration

A single MongoDB `$group` aggregation (`{ $group: { _id: { source: '$source', content_status: '$content_status' },
count: { $sum: 1 }, avgWordCount: { $avg: '$word_count' } } }`) computes the per-source/per-status breakdown in
one round trip rather than loading every document into Node and reducing in memory — the collection can hold
tens of thousands of documents by now, and this must stay cheap enough to re-run anytime.

### 2. Sampling failed/none items via a bounded `find`, not part of the aggregation

A separate `NewsItem.find({ content_status: { $in: ['none', 'failed'] } }, { title: 1, url: 1, source: 1 })
.limit(20)` query pulls a small sample for manual spot-checking (task doc explicitly asks for "a sample of
failed/none titles+urls"). Kept as a second query rather than folded into the aggregation via `$push` +
`$slice` — simpler to read, and 20 extra documents is negligible cost next to the aggregation itself.

### 3. Output format: console table, following the existing `verify:*` script convention

Every existing script in `backend/src/scripts/` prints structured `console.log` output and a final PASS/FAIL or
summary line (see `verifyTrendDecayLive.ts`). This script does the same — a per-source table (via
`console.table` for the status breakdown) plus a flat list for the failed/none sample — rather than writing a
JSON/CSV file, since the point is a human reading it once, not a machine-parseable artifact.

### 4. `word_count` average is computed only over documents where it's set

`$avg` in Mongo already ignores missing/null fields for the divisor in recent server versions, but the script
explicitly documents this behavior in its own output label (`avg word_count (where present)`) rather than
silently leaving it ambiguous whether a `none`-status item (which has no `word_count`) dragged the average down.

## Risks / Trade-offs

- **[Risk] The live collection may have grown large enough that even the aggregation is slow** → Mitigation:
  the aggregation only groups on two indexed-adjacent fields (`source`, `content_status`) and returns a small
  result set (source × 4 statuses, not per-document); if this becomes slow at scale, an index on
  `{ source: 1, content_status: 1 }` is the documented follow-up (not added preemptively — no evidence yet
  it's needed, consistent with "audit first, fix real gaps").
- **[Trade-off] Findings are a snapshot, not continuously monitored** → Accepted; this is explicitly a one-off
  measurement per the proposal, not a dashboard. Re-running the same script later is how staleness gets caught.

## Migration Plan

No migration — purely additive tooling (one new script file, one new `package.json` entry). Nothing to roll
back beyond deleting the file if it's ever no longer wanted.

## Open Questions

None — scope is deliberately narrow (measurement only) precisely to avoid open design questions about fixes
that haven't been justified by data yet.
