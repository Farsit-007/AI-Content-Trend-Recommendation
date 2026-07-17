## 1. Model + service

- [x] 1.1 `backend/src/app/modules/NewsDedupLedger/newsDedupLedger.interface.ts`: `INewsDedupLedger { content_hash: string; title: string; source: string; deleted_at: Date }`
- [x] 1.2 `backend/src/app/modules/NewsDedupLedger/newsDedupLedger.model.ts`: schema with `content_hash` unique, `title`, `source`, `deleted_at: { type: Date, default: Date.now }`; TTL index `{ deleted_at: 1 }, { expireAfterSeconds: config.news_ingestion.dedup_ledger_ttl_days * 86400 }` (computed from config, not hardcoded — design.md decision 2); collection name `news_dedup_ledger`
- [x] 1.3 `backend/src/app/modules/NewsDedupLedger/newsDedupLedger.service.ts`: `recordTombstones(items: { content_hash: string; title: string; source: string }[])` — `insertMany(items, { ordered: false })`; catch and swallow only duplicate-key errors (Mongo error code `11000`, including inside a `BulkWriteError`'s per-doc write errors), rethrow anything else; no-op (return immediately) when `items` is empty
- [x] 1.4 Config: `NEWS_DEDUP_LEDGER_TTL_DAYS` default `'30'` in envSchema; export under `news_ingestion.dedup_ledger_ttl_days`; document in `.env.example` including the note that changing it post-deploy does not retroactively update an already-created TTL index (requires a manual `collMod`)

## 2. Wire-in

- [x] 2.1 `newsIngestion.utils.ts` `dedupeAgainstStored`: run the existing `NewsItem` hash query and a new `NewsDedupLedger` hash query via `Promise.all`; union both hash sets into the existing exclusion `Set`; wrap the ledger query in its own try/catch — on failure, log and proceed with an empty ledger-hash set (stored-item dedup only)
- [x] 2.2 `newsItem.service.ts` `deleteNewsItem`: load the item first (need `content_hash`, `title`, `source`), call `recordTombstones([...])`, then `findByIdAndDelete`; if the item doesn't exist, keep returning `null` exactly as today (no tombstone write for a no-op delete)

## 3. Tests

- [x] 3.1 Unit: `recordTombstones` is idempotent on a duplicate `content_hash` (does not throw); rethrows non-duplicate-key errors; no-ops on an empty array
- [x] 3.2 Integration: insert an item → delete it via `NewsItemService.deleteNewsItem` → ledger row exists with that `content_hash` → run `dedupeAgainstStored` with a same-hash candidate (no live row) → candidate is dropped
- [x] 3.3 Integration: `dedupeAgainstStored` still drops a candidate matching a live stored item's hash when no ledger tombstone exists (regression guard on existing behavior)
- [x] 3.4 Integration: `dedupeAgainstStored` fails open when the ledger query rejects (mock `NewsDedupLedger.find` to throw) — run completes, stored-item dedup still applies, failure is logged
- [x] 3.5 Integration: TTL index exists on `news_dedup_ledger` with `expireAfterSeconds` matching `NEWS_DEDUP_LEDGER_TTL_DAYS * 86400`

## 4. Verification

- [x] 4.1 `cd backend && npm run build` passes; server boots with `NEWS_DEDUP_LEDGER_TTL_DAYS` unset
- [x] 4.2 Live (`npm run verify:dedup-tombstone-live`, against real Atlas data): deleted a real stored `github_trending` item ("HKUDS/Vibe-Trading"), confirmed the tombstone was written, re-ran ingestion (fetched 39 github_trending candidates, `stored: 0`), confirmed no live row exists with the deleted item's `content_hash` afterward
- [x] 4.3 Live: confirmed via `NewsDedupLedger.collection.indexes()` — TTL index on `deleted_at` with `expireAfterSeconds: 2592000` matching `NEWS_DEDUP_LEDGER_TTL_DAYS=30`
