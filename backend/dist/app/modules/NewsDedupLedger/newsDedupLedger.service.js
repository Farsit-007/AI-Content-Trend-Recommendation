"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordTombstones = void 0;
const logger_1 = require("../../lib/logger");
const newsDedupLedger_model_1 = require("./newsDedupLedger.model");
const DUPLICATE_KEY_CODE = 11000;
const writeErrorCode = (writeErr) => { var _a, _b; return (_a = writeErr.code) !== null && _a !== void 0 ? _a : (_b = writeErr.err) === null || _b === void 0 ? void 0 : _b.code; };
/** True only when every failure in the batch was "hash already tombstoned" — the one case
 * `recordTombstones` treats as success rather than a real write failure (design.md decision 5). */
const isDuplicateKeyOnly = (err) => {
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
const recordTombstones = (items) => __awaiter(void 0, void 0, void 0, function* () {
    if (items.length === 0)
        return;
    try {
        yield newsDedupLedger_model_1.NewsDedupLedger.insertMany(items, { ordered: false });
    }
    catch (err) {
        const bulkErr = err;
        if (!isDuplicateKeyOnly(bulkErr)) {
            throw err;
        }
        logger_1.logger.warn({ count: items.length }, '[NewsDedupLedger] recordTombstones: some hashes were already tombstoned (duplicate key) — treated as success');
    }
});
exports.recordTombstones = recordTombstones;
