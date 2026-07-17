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
exports.runEngagementRefresh = exports.selectWithinBudget = void 0;
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
const redis_1 = require("../../lib/redis");
const maintenanceRun_model_1 = require("../MaintenanceRun/maintenanceRun.model");
const newsIngestion_scoring_1 = require("../NewsIngestion/newsIngestion.scoring");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const newsRefresh_fetchers_1 = require("./newsRefresh.fetchers");
const LOCK_KEY = 'lock:news_refresh';
const LOCK_TTL_MS = 55 * 60 * 1000;
const REDDIT_BATCH_SIZE = 100;
const HISTORY_SLICE = -32;
/**
 * Deterministic pre-call cost estimate used to decide which youngest-first candidates fit the
 * request budget: hackernews/devto cost 1 request/item; reddit costs 1 request per *started*
 * 100-item chunk (the 2nd-100th reddit item in a chunk is free). Actual request counts persisted
 * to `maintenance_runs` come from what each fetcher reports having issued, not this estimate.
 */
const estimateCost = (source, redditCountSoFar) => {
    if (source !== 'reddit')
        return 1;
    return redditCountSoFar % REDDIT_BATCH_SIZE === 0 ? 1 : 0;
};
/** Walks youngest-first candidates, stopping the instant the next item's cost would exceed the
 * remaining budget — older items past that point are simply not refreshed this run. Exported for
 * direct unit testing (see newsRefresh.service.test.ts). */
const selectWithinBudget = (candidates, maxRequests) => {
    var _a;
    var _b;
    const selected = {};
    let remaining = maxRequests;
    let redditCountSoFar = 0;
    for (const candidate of candidates) {
        const cost = estimateCost(candidate.source, redditCountSoFar);
        if (cost > remaining)
            break;
        remaining -= cost;
        if (candidate.source === 'reddit')
            redditCountSoFar += 1;
        ((_a = selected[_b = candidate.source]) !== null && _a !== void 0 ? _a : (selected[_b] = [])).push(candidate);
    }
    return selected;
};
exports.selectWithinBudget = selectWithinBudget;
/** Persists one `maintenance_runs` document per run, success or failure alike (mirrors
 * `newsIngestion.service.ts`'s `persistRun`). Never throws: a failed write must not affect the
 * refresh job's own outcome. */
const persistMaintenanceRun = (state) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const finished_at = new Date();
        yield maintenanceRun_model_1.MaintenanceRun.create({
            job: 'engagement_refresh',
            started_at: state.started_at,
            finished_at,
            duration_ms: finished_at.getTime() - state.started_at.getTime(),
            counts: state.counts,
            error: state.error,
        });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsRefresh] failed to persist MaintenanceRun');
    }
});
const runEngagementRefresh = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const started_at = new Date();
    // Expire-only release (no compare-and-delete): the PX window is well under the hourly cron
    // period, which is sufficient here and keeps the lock logic simple (design.md decision 6).
    const acquired = yield redis_1.redis.set(LOCK_KEY, String(started_at.getTime()), 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
        logger_1.logger.info('[NewsRefresh] Another refresh run holds the lock — skipping');
        return;
    }
    const counts = { candidates: 0, refreshed: 0, source_removed: 0, request_count: 0, errors: {} };
    let topLevelError;
    try {
        // Idempotent — only matches rows that have never had a score computed (pre-dates this
        // feature); a no-op on every subsequent run. Folded into the refresh job rather than a
        // separate migration (design.md decision 3).
        yield newsItem_model_1.NewsItem.updateMany({ current_trend_score: { $exists: false } }, [
            { $set: { current_trend_score: '$trend_score' } },
        ]);
        const windowCutoff = new Date(Date.now() - config_1.default.news_ingestion.refresh.window_hours * 60 * 60 * 1000);
        const candidates = yield newsItem_model_1.NewsItem.find({
            created_at: { $gte: windowCutoff },
            source: { $in: newsRefresh_fetchers_1.REFRESHABLE_SOURCES },
            lifecycle: { $ne: 'archived' },
        }, { _id: 1, source: 1, source_id: 1, created_at: 1, published_at: 1, engagement: 1, engagement_history: 1 })
            .sort({ created_at: -1 })
            .lean();
        counts.candidates = candidates.length;
        const selected = (0, exports.selectWithinBudget)(candidates, config_1.default.news_ingestion.refresh.max_requests);
        const now = new Date();
        const bulkOps = [];
        for (const [source, items] of Object.entries(selected)) {
            if (items.length === 0)
                continue;
            const fetcher = newsRefresh_fetchers_1.ENGAGEMENT_FETCHERS[source];
            try {
                const { results, requestsUsed } = yield fetcher(items.map((item) => ({ source_id: item.source_id })));
                counts.request_count += requestsUsed;
                const bySourceId = new Map(items.map((item) => [item.source_id, item]));
                for (const result of results) {
                    const candidate = bySourceId.get(result.source_id);
                    if (!candidate)
                        continue;
                    if (result.removed) {
                        counts.source_removed += 1;
                        // Decay still advances even though there's no new engagement snapshot to append.
                        const current_trend_score = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({
                            engagement: candidate.engagement,
                            published_at: candidate.published_at,
                            created_at: candidate.created_at,
                            engagement_history: candidate.engagement_history,
                        }, now);
                        bulkOps.push({
                            updateOne: { filter: { _id: candidate._id }, update: { $set: { source_removed: true, current_trend_score } } },
                        });
                        continue;
                    }
                    const snapshot = { at: now, points: result.points, comments: result.comments, stars_delta: result.stars_delta };
                    // First-touch: prepend the ingest-time snapshot so velocity is computable after this
                    // single refresh instead of requiring two (design.md decision 7).
                    const historyToPush = ((_a = candidate.engagement_history) === null || _a === void 0 ? void 0 : _a.length)
                        ? [snapshot]
                        : [Object.assign({ at: candidate.created_at }, candidate.engagement), snapshot];
                    const current_trend_score = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({
                        engagement: { points: result.points, comments: result.comments, stars_delta: result.stars_delta },
                        published_at: candidate.published_at,
                        created_at: candidate.created_at,
                        engagement_history: [...((_b = candidate.engagement_history) !== null && _b !== void 0 ? _b : []), ...historyToPush],
                    }, now);
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: candidate._id },
                            update: {
                                $set: {
                                    'engagement.points': result.points,
                                    'engagement.comments': result.comments,
                                    'engagement.stars_delta': result.stars_delta,
                                    engagement_refreshed_at: now,
                                    current_trend_score,
                                },
                                $push: { engagement_history: { $each: historyToPush, $slice: HISTORY_SLICE } },
                            },
                        },
                    });
                    counts.refreshed += 1;
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                counts.errors[source] = message;
                logger_1.logger.error({ err: message }, `[NewsRefresh] ${source} refresh failed`);
            }
        }
        if (bulkOps.length > 0) {
            yield newsItem_model_1.NewsItem.bulkWrite(bulkOps, { ordered: false });
        }
    }
    catch (err) {
        topLevelError = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: topLevelError }, '[NewsRefresh] engagement refresh run failed');
    }
    yield persistMaintenanceRun({ started_at, counts, error: topLevelError });
});
exports.runEngagementRefresh = runEngagementRefresh;
