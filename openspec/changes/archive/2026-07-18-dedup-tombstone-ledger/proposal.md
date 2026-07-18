## Why

The unique `content_hash` on `news_items` is the only thing preventing re-ingestion of a URL (`dedupeAgainstStored`, `newsIngestion.utils.ts`). Deleting a row deletes the hash with it. GitHub-Trending scrape-path items have `published_at: undefined`, so `filterFresh` treats them as always-fresh and bypasses the freshness filter entirely — a deleted repo that still trends is guaranteed to re-ingest on the very next run, get re-embedded and re-categorized (LLM cost), and reappear in the feed as "new." The manual admin delete endpoint (`DELETE /news-items/:id`) has this resurrection hazard **today**; a future bulk retention-delete job would industrialize it. Deleted hashes must survive their rows before any bulk delete ships.

## What Changes

- New collection `news_dedup_ledger` (model `NewsDedupLedger`): `{ content_hash: <unique>, title, source, deleted_at: <TTL-indexed> }`, TTL from `NEWS_DEDUP_LEDGER_TTL_DAYS` (default 30). No embeddings stored — hash-dedup alone stops exact resurrection, and the semantic pool's freshness window barely overlaps ledger ages.
- Exported helper `recordTombstones(items)` — bulk insert (`ordered: false`), tolerating duplicate-key errors so retries/crashes are idempotent.
- `dedupeAgainstStored` additionally checks the ledger: a second `$in` query on `NewsDedupLedger`, run in parallel with the existing stored-item query, results unioned into the exclusion set. A ledger read failure is logged and ingestion proceeds with stored-item dedup only (fail open on *dedup*, never on *storage*).
- The manual admin delete path (`NewsItemService.deleteNewsItem`) writes a tombstone **before** deleting the item.
- Ledger TTL expiry is a feature, not a gap: after the TTL window a resurfacing story is genuinely re-newsworthy and re-enters the pipeline normally.

## Capabilities

### New Capabilities
- `news-retention`: introduces the dedup tombstone ledger — the first requirement in what will become a broader retention capability (later changes in this plan add lifecycle/archival requirements to the same capability).

### Modified Capabilities
- `news-ingestion`: hash-dedup during ingestion additionally consults the tombstone ledger, dropping candidates that match a previously-deleted item's hash even though no live row exists. `openspec/specs/news-ingestion/` has never been synced (no archived change in this project has synced specs yet), so this delta restates the full requirement text rather than diffing an on-disk main spec, per the parent plan's established convention.

## Impact

- New: `backend/src/app/modules/NewsDedupLedger/` (`newsDedupLedger.interface.ts`, `newsDedupLedger.model.ts`, `newsDedupLedger.service.ts` exporting `recordTombstones`).
- `backend/src/app/modules/NewsIngestion/newsIngestion.utils.ts` — `dedupeAgainstStored` gains the ledger check.
- `backend/src/app/modules/NewsItem/newsItem.service.ts` — `deleteNewsItem` writes a tombstone before deleting.
- `backend/src/app/config/index.ts` + `backend/.env.example` — `NEWS_DEDUP_LEDGER_TTL_DAYS`.

**Out of scope for this change** (belongs to later changes in the same plan): any `lifecycle`/archive/hard-delete job that would actually call `recordTombstones` in bulk, `story_id`/story-chain protections, and two-band semantic dedup. This change only builds the ledger and wires it into the two delete/dedup paths that exist today.
