## Context

`dedupeAgainstStored` (`newsIngestion.utils.ts`) is a single `$in` query against `NewsItem.content_hash` plus an in-run `Set`, used to drop candidates whose hash already exists. There is no delete-time bookkeeping anywhere: `NewsItemService.deleteNewsItem` (`newsItem.service.ts`) is a bare `NewsItem.findByIdAndDelete(id)`. `github_trending`'s scrape-path items carry `published_at: undefined`, and `filterFresh` treats missing dates as fresh — so a deleted-and-still-trending repo is guaranteed to pass the freshness filter, miss the hash check (its row is gone), and re-ingest, re-embed, and re-categorize on the very next run. This is the first of a four-part retention plan (`engagement-refresh-job` → `trend-decay-scoring` → `dedup-tombstone-ledger` → `news-retention-lifecycle`); it is independent of the first two (no dependency on `engagement_history` or `current_trend_score`) and exists specifically to make bulk deletion in the fourth change safe.

Constraints carried forward from the parent plan (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, Change R3) and from the codebase:
- `IngestionRun` and `MaintenanceRun` (from `engagement-refresh-job`) are the established pattern for self-cleaning collections, but both use a hardcoded 30-day `expireAfterSeconds` literal on the schema. This ledger's TTL is operator-configurable (`NEWS_DEDUP_LEDGER_TTL_DAYS`), so its index must compute `expireAfterSeconds` from config at schema-definition time instead of hardcoding it.
- Config pattern is zod `envSchema` with `.default()`/`.optional()` string values, `Number(...)` in the exported config object — new env vars must be optional with a safe default so the server boots with none of them set.
- `computeContentHash(source, url)` (`newsIngestion.utils.ts`) must not change — this change only adds a second place that hash is checked against, never touches how it's computed.
- `openspec/specs/` has never been synced by any archived change in this project — this change's delta specs restate full requirement text rather than diffing an on-disk main spec.

## Goals / Non-Goals

**Goals:**
- Make a deleted item's `content_hash` block future re-ingestion of the same URL, surviving the row's deletion.
- Wire tombstone-writing into the one delete path that exists today (`DELETE /news-items/:id`).
- Wire tombstone-checking into ingestion's existing hash-dedup step, alongside the existing stored-item check.
- Let old tombstones expire on a configurable TTL, so a genuinely-resurfaced story (not a re-ingestion artifact) can re-enter the pipeline after enough time has passed.
- Make tombstone writes idempotent, since a later bulk-delete job (out of scope here) will call this same helper in batches and must tolerate partial-failure retries.

**Non-Goals:**
- Building the bulk retention/archive job that would call `recordTombstones` at scale — that is a later change in the same plan.
- Any `lifecycle` field, archive state, or story-chain (`story_id`) protection — none of these exist yet.
- Storing embeddings in the ledger for semantic-resurrection detection — the deep-dive this plan is based on explicitly recommends against it (hash-dedup alone stops exact resurrection; the semantic pool's freshness window barely overlaps ledger ages); revisit only if run history later shows paraphrase re-admission is a real problem.
- Changing `computeContentHash`, the semantic-dedup threshold, or `dedupeSemantic`.

## Decisions

1. **Tombstone-before-delete is the invariant.** `deleteNewsItem` must load the item, call `recordTombstones([...])`, and only then call the actual delete. A crash between the two steps leaves a harmless extra tombstone (which just blocks re-ingestion of a hash that — since the delete didn't happen — is still blocked by the live row's own hash anyway: a no-op, not a resurrection window). The reverse order (delete-then-tombstone) is the one arrangement that must never happen, since a crash there leaves a genuine resurrection window.
2. **TTL seconds computed from config at schema-definition time**, unlike `IngestionRun`/`MaintenanceRun`'s hardcoded `2592000` literal: `newsDedupLedgerSchema.index({ deleted_at: 1 }, { expireAfterSeconds: config.news_ingestion.dedup_ledger_ttl_days * 86400 })`. Document in `.env.example` that changing `NEWS_DEDUP_LEDGER_TTL_DAYS` after the index already exists in a deployed MongoDB does **not** retroactively change that live index — Mongo requires an explicit `collMod` (or dropping/recreating the index) to pick up a new `expireAfterSeconds` value. This change does not build automatic index reconciliation; that's an operator runbook note, not code.
3. **Two separate `$in` queries, not `$unionWith`.** `dedupeAgainstStored` runs the existing `NewsItem` hash query and a new `NewsDedupLedger` hash query via `Promise.all`, then unions the two result sets into one exclusion `Set`. Keeps the function readable, keeps both queries independently indexed, and isolates the ledger query's own try/catch (decision 4) from the stored-item query's.
4. **Ledger lookup fails open, storage fails closed.** If the ledger `$in` query throws, log it and proceed with stored-item dedup only — a missed tombstone re-admits one story (self-correcting, since content still fresh-checks and category-checks normally); by contrast, `recordTombstones` failing during a delete is *not* swallowed silently — `deleteNewsItem` still deletes (delete-then-fail-open would be strictly worse: it would drop the very check meant to prevent resurrection). Concretely: `recordTombstones` only swallows duplicate-key (`E11000`) errors — those mean "already tombstoned," not "failed to tombstone" — and rethrows anything else, so a genuine write failure surfaces to the caller rather than silently proceeding to delete.
5. **`recordTombstones` batches via `insertMany({ ordered: false })`.** Unordered so one duplicate-key hash (already tombstoned by a prior partial run) doesn't stop the rest of the batch from inserting; duplicate-key errors are caught and swallowed specifically (matched by MongoDB error code `11000`), any other error type is rethrown. This is what makes the helper safe to call repeatedly with overlapping batches — required for the later bulk-delete job's retry behavior even though that job isn't built here.
6. **`title`/`source` are debugging-only fields on the ledger**, never queried by dedup logic (only `content_hash` is). Keeps the ledger lean and avoids tempting future code into building ledger-based analytics that don't belong here.
7. **No API surface.** This change adds no routes — the ledger is consulted internally by ingestion and written internally by the existing delete service function. Nothing about `DELETE /news-items/:id`'s request/response contract changes.

## Risks / Trade-offs

- **[Risk] A missed tombstone (ledger read failure, or a delete that predates this change) lets one story resurrect once.** → Mitigation: self-correcting — once re-ingested it hash-dedupes normally against the live row from then on; this only ever costs one extra LLM/embedding round-trip, not an unbounded loop.
- **[Risk] Changing `NEWS_DEDUP_LEDGER_TTL_DAYS` doesn't retroactively update an already-deployed TTL index.** → Documented in `.env.example` and design decision 2; out of scope to auto-reconcile.
- **[Trade-off] No embeddings in the ledger means a paraphrased near-duplicate of a deleted item is not blocked.** → Accepted per the parent deep-dive's explicit recommendation; the semantic-dedup pool's short freshness window rarely overlaps a tombstone's age anyway, so the marginal protection wouldn't be worth the storage/complexity.
- **[Risk] `Promise.all([stored-item query, ledger query])` means a slow/failing ledger query could delay ingestion.** → Mitigation: the ledger query has its own try/catch and a bounded `$in` (same size as the existing stored-item query), so its cost profile matches a query ingestion already performs every run.

## Migration Plan

- `NEWS_DEDUP_LEDGER_TTL_DAYS` is optional with a default; no `.env` changes required to deploy, server boots with it unset.
- The `news_dedup_ledger` collection is created implicitly by Mongoose on first write; its TTL index is declared on the schema and created on first connection, same as `IngestionRun`/`MaintenanceRun`.
- No backfill: items deleted before this change shipped have no tombstone and remain re-ingestible exactly as they are today — this change only prevents *future* deletions from creating a resurrection hazard, retroactive protection is not a goal.
- Rollback: reverting the `dedupeAgainstStored` and `deleteNewsItem` call sites returns to current behavior; the `news_dedup_ledger` collection itself is inert if unused (no other code path depends on it existing).

## Open Questions

None — scope, defaults, and the tombstone-before-delete ordering are fixed by the parent plan (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, Change R3).
