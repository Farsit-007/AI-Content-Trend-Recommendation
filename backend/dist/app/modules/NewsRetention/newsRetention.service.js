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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNewsRetention = exports.engagementSignalClause = void 0;
const mongoose_1 = require("mongoose");
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
const redis_1 = require("../../lib/redis");
const maintenanceRun_model_1 = require("../MaintenanceRun/maintenanceRun.model");
const newsDedupLedger_service_1 = require("../NewsDedupLedger/newsDedupLedger.service");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const newsItemCategoryOverride_model_1 = require("../NewsItemCategoryOverride/newsItemCategoryOverride.model");
const newsRefresh_fetchers_1 = require("../NewsRefresh/newsRefresh.fetchers");
const LOCK_KEY = 'lock:news_retention';
// ~0.92 of the 6h default cron period, matching the engagement-refresh job's PX/cron ratio.
const LOCK_TTL_MS = 5.5 * 60 * 60 * 1000;
const ARCHIVE_BATCH_CAP = 2000;
const DELETE_BATCH_SIZE = 500;
const RECENT_OVERRIDE_PROTECTION_DAYS = 30;
const FRESH_NEEDS_REVIEW_PROTECTION_DAYS = 7;
/** Mirrors `hasEngagementSignal` (newsIngestion.scoring.ts) exactly — exported so a unit test can
 * assert the two never drift (design.md decision 3). */
exports.engagementSignalClause = {
    $or: [
        { source: { $in: newsRefresh_fetchers_1.REFRESHABLE_SOURCES } },
        { 'engagement.points': { $gt: 0 } },
        { 'engagement.comments': { $gt: 0 } },
        { 'engagement.stars_delta': { $gt: 0 } },
    ],
};
const chunk = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size)
        chunks.push(arr.slice(i, i + size));
    return chunks;
};
/** Persists one `maintenance_runs` document per run, success or failure alike (mirrors
 * `NewsRefresh/newsRefresh.service.ts`'s `persistMaintenanceRun`). Never throws. */
const persistMaintenanceRun = (state) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const finished_at = new Date();
        yield maintenanceRun_model_1.MaintenanceRun.create({
            job: 'retention',
            started_at: state.started_at,
            finished_at,
            duration_ms: finished_at.getTime() - state.started_at.getTime(),
            counts: state.counts,
            error: state.error,
        });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsRetention] failed to persist MaintenanceRun');
    }
});
const runNewsRetention = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const started_at = new Date();
    const acquired = yield redis_1.redis.set(LOCK_KEY, String(started_at.getTime()), 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
        logger_1.logger.info('[NewsRetention] Another retention run holds the lock — skipping');
        return;
    }
    const counts = {
        candidates: 0,
        backfilled: 0,
        archived: { max_age: 0, trend_floor: 0, source_removed: 0 },
        deleted: 0,
        overrides_removed: 0,
        tombstones_written: 0,
    };
    let topLevelError;
    try {
        // Idempotent — only matches rows that predate this feature; a no-op on every subsequent run.
        const backfillResult = yield newsItem_model_1.NewsItem.updateMany({ lifecycle: { $exists: false } }, { $set: { lifecycle: 'active' } });
        counts.backfilled = (_a = backfillResult.modifiedCount) !== null && _a !== void 0 ? _a : 0;
        const now = new Date();
        const maxAgeCutoff = new Date(now.getTime() - config_1.default.news_ingestion.retention.max_age_hours * 60 * 60 * 1000);
        const minAgeCutoff = new Date(now.getTime() - config_1.default.news_ingestion.retention.min_age_hours * 60 * 60 * 1000);
        const recentOverrideCutoff = new Date(now.getTime() - RECENT_OVERRIDE_PROTECTION_DAYS * 24 * 60 * 60 * 1000);
        const freshNeedsReviewCutoff = new Date(now.getTime() - FRESH_NEEDS_REVIEW_PROTECTION_DAYS * 24 * 60 * 60 * 1000);
        // NewsItemCategoryOverride stores news_item_id as a plain String; map to ObjectId for the
        // _id comparison below.
        const recentlyOverriddenIds = yield newsItemCategoryOverride_model_1.NewsItemCategoryOverride.distinct('news_item_id', {
            overridden_at: { $gte: recentOverrideCutoff },
        });
        const recentlyOverriddenObjectIds = recentlyOverriddenIds
            .filter((id) => typeof id === 'string' && mongoose_1.Types.ObjectId.isValid(id))
            .map((id) => new mongoose_1.Types.ObjectId(id));
        // Composable guard clauses (design.md decision 7): a future story-liveness protection lands
        // here as a third array entry, no restructuring needed.
        const protectionClauses = [
            { _id: { $in: recentlyOverriddenObjectIds } },
            { needs_review: true, created_at: { $gte: freshNeedsReviewCutoff } },
        ];
        const archiveCandidates = yield newsItem_model_1.NewsItem.find({
            lifecycle: 'active',
            $nor: protectionClauses,
            $or: [
                { created_at: { $lt: maxAgeCutoff } },
                Object.assign({ created_at: { $lt: minAgeCutoff }, current_trend_score: { $lt: config_1.default.news_ingestion.retention.trend_floor } }, exports.engagementSignalClause),
                { source_removed: true },
            ],
        }, { _id: 1, created_at: 1, source_removed: 1 })
            .limit(ARCHIVE_BATCH_CAP)
            .lean();
        counts.candidates = archiveCandidates.length;
        const archiveOps = archiveCandidates.map((item) => {
            // Precedence when an item matches more than one condition: source_removed is the
            // strongest, independent signal; max_age is a hard ceiling regardless of score;
            // trend_floor is the only remaining case the $or above could have matched.
            const reason = item.source_removed
                ? 'source_removed'
                : item.created_at < maxAgeCutoff
                    ? 'max_age'
                    : 'trend_floor';
            counts.archived[reason] += 1;
            return {
                updateOne: {
                    filter: { _id: item._id },
                    update: { $set: { lifecycle: 'archived', archived_at: now, archive_reason: reason } },
                },
            };
        });
        if (archiveOps.length > 0) {
            yield newsItem_model_1.NewsItem.bulkWrite(archiveOps, { ordered: false });
        }
        // Stage 2 — hard-delete items past the cooling-off window, cascading per batch:
        // tombstone -> override cleanup -> item delete. A crash between steps is safe (dedup-
        // tombstone-ledger design.md decision 1) — the next run re-selects the still-archived items.
        const deleteCutoff = new Date(now.getTime() - config_1.default.news_ingestion.retention.delete_after_days * 24 * 60 * 60 * 1000);
        const toDelete = yield newsItem_model_1.NewsItem.find({ lifecycle: 'archived', archived_at: { $lt: deleteCutoff } }, { _id: 1, content_hash: 1, title: 1, source: 1 }).lean();
        for (const batch of chunk(toDelete, DELETE_BATCH_SIZE)) {
            yield (0, newsDedupLedger_service_1.recordTombstones)(batch.map((item) => ({ content_hash: item.content_hash, title: item.title, source: item.source })));
            counts.tombstones_written += batch.length;
            const batchIds = batch.map((item) => item._id);
            const overrideResult = yield newsItemCategoryOverride_model_1.NewsItemCategoryOverride.deleteMany({ news_item_id: { $in: batchIds.map(String) } });
            counts.overrides_removed += (_b = overrideResult.deletedCount) !== null && _b !== void 0 ? _b : 0;
            const deleteResult = yield newsItem_model_1.NewsItem.deleteMany({ _id: { $in: batchIds } });
            counts.deleted += (_c = deleteResult.deletedCount) !== null && _c !== void 0 ? _c : 0;
        }
    }
    catch (err) {
        topLevelError = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: topLevelError }, '[NewsRetention] retention run failed');
    }
    yield persistMaintenanceRun({ started_at, counts, error: topLevelError });
});
exports.runNewsRetention = runNewsRetention;
