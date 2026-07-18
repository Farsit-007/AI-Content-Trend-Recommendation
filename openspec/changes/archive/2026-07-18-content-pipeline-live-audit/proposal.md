## Why

Content generation (V7 style-grounded, V9 non-AI-feeling output) is only as good as the source material it's
grounded on. Nobody has measured, against the real deployment's live `news_items` collection, how much of the
stored content is actually usable (`content_status: full`/`partial` with a meaningful `word_count`) versus thin
or missing (`none`/`failed`). Per the user's own "don't do anything by assuming" standard, any tuning of content
capture (adapter fixes, `CONTENT_MAX_CHARS`, `CONTENT_FACTS_MIN_CHARS`) must be driven by what the real data
shows is actually broken — not a guess about which sources or thresholds are the problem.

## What Changes

- A new one-off, read-only audit script (`backend/src/scripts/auditContentCoverage.ts`, wired to
  `npm run audit:content-coverage`) that queries the live `news_items` collection and reports, per `source`:
  count and percentage at each `content_status` (`none`/`partial`/`full`/`failed`), average `word_count` where
  present, and a sample of `failed`/`none` titles+urls for manual spot-checking.
- The script is run once against the real deployment as part of this change's own verification.
- Findings are written back into `10-VISION-PLATFORM-OPS-AND-CONTENT-FIDELITY-OPENSPEC-PLAN.md`'s Track C
  section as a factual update.
- **No pipeline behavior, adapter, or config-threshold changes are committed by this change.** If the real
  findings show a genuine gap worth fixing, that becomes a separate, follow-up proposal scoped from the actual
  data — not bundled in here sight-unseen.

## Capabilities

### New Capabilities
- `content-coverage-audit`: a read-only, live-safe reporting script that measures per-source content capture
  health in the real `news_items` collection, to ground any future content-pipeline tuning in real data.

### Modified Capabilities
(none — purely additive tooling, no existing requirement changes)

## Impact

- **Affected code:** new file `backend/src/scripts/auditContentCoverage.ts`; one new `package.json` script
  entry (`audit:content-coverage`). No production code paths touched.
- **Affected systems:** read-only MongoDB aggregation queries against the real `news_items` collection in this
  deployment's Atlas cluster. No writes, no side effects, safe to re-run anytime.
- **Depends on:** the `discussion_url`/`thumbnail_url` fields and content-fetch pipeline already shipped by
  `news-source-link-and-thumbnail-fields` and the pre-existing `newsIngestion.contentFetch.ts` enrichment layer
  — this change measures their real-world output, it doesn't change them.
