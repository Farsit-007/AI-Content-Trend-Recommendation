import { logger } from '../../lib/logger';
import { NewsDedupLedger } from './newsDedupLedger.model';

const DUPLICATE_KEY_CODE = 11000;

interface MongoWriteError {
  code?: number;
  // The Node driver's BulkWriteError nests the actual server error under `.err`; the top-level
  // `.code` on each write-error entry is not populated the same way `MongoBulkWriteError.code` is.
  err?: { code?: number };
}

interface MongoBulkWriteErrorLike {
  code?: number;
  writeErrors?: MongoWriteError[];
}

const writeErrorCode = (writeErr: MongoWriteError): number | undefined => writeErr.code ?? writeErr.err?.code;

/** True only when every failure in the batch was "hash already tombstoned" — the one case
 * `recordTombstones` treats as success rather than a real write failure (design.md decision 5). */
const isDuplicateKeyOnly = (err: MongoBulkWriteErrorLike): boolean => {
  if (err.writeErrors && err.writeErrors.length > 0) {
    return err.writeErrors.every((writeErr) => writeErrorCode(writeErr) === DUPLICATE_KEY_CODE);
  }
  return err.code === DUPLICATE_KEY_CODE;
};

/**
 * Bulk-inserts tombstones for deleted items. Idempotent: re-recording an already-tombstoned
 * `content_hash` is not an error, so callers (including a future batched retention job) can
 * retry overlapping batches freely. Any non-duplicate-key failure is rethrown — a genuine
 * write failure must surface to the caller, never be silently swallowed (design.md decision 4).
 */
export const recordTombstones = async (
  items: { content_hash: string; title: string; source: string }[],
): Promise<void> => {
  if (items.length === 0) return;

  try {
    await NewsDedupLedger.insertMany(items, { ordered: false });
  } catch (err) {
    const bulkErr = err as MongoBulkWriteErrorLike;
    if (!isDuplicateKeyOnly(bulkErr)) {
      throw err;
    }
    logger.warn(
      { count: items.length },
      '[NewsDedupLedger] recordTombstones: some hashes were already tombstoned (duplicate key) — treated as success',
    );
  }
};
