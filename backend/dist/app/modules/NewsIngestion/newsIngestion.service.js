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
exports.runIngestionPipeline = exports.buildSourceRunCounts = exports.buildSourceSummaries = exports.unionSourceKeys = exports.withContentMeta = void 0;
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const ingestionRun_model_1 = require("../IngestionRun/ingestionRun.model");
const adapters_1 = require("./adapters");
const newsIngestion_categorize_1 = require("./newsIngestion.categorize");
const newsIngestion_contentFetch_1 = require("./newsIngestion.contentFetch");
const newsIngestion_scoring_1 = require("./newsIngestion.scoring");
const newsIngestion_utils_1 = require("./newsIngestion.utils");
/** Caps raw adapter-provided content once, centrally, so every source's truncation/status logic is identical. */
const withContentMeta = (content, maxChars) => {
    if (!content)
        return { content_status: 'none' };
    const capped = content.length > maxChars;
    const text = capped ? content.slice(0, maxChars) : content;
    return {
        content: text,
        content_status: capped ? 'partial' : 'full',
        word_count: text.split(/\s+/).filter(Boolean).length,
        content_fetched_at: new Date(),
    };
};
exports.withContentMeta = withContentMeta;
const countBySource = (items) => {
    var _a;
    const counts = {};
    for (const item of items) {
        counts[item.source] = ((_a = counts[item.source]) !== null && _a !== void 0 ? _a : 0) + 1;
    }
    return counts;
};
/**
 * Adapters may emit items under more source labels than their own adapter name (e.g. the RSS
 * adapter labels items `rss:<hostname>` per feed). The summary must cover both the adapter names
 * (so a source that errored or fetched nothing still gets a zero-count row) and every label that
 * actually appeared on an item, in that order.
 */
const unionSourceKeys = (adapterSources, itemSourceKeys) => {
    const seen = new Set(adapterSources);
    const ordered = [...adapterSources];
    for (const key of itemSourceKeys) {
        if (!seen.has(key)) {
            seen.add(key);
            ordered.push(key);
        }
    }
    return ordered;
};
exports.unionSourceKeys = unionSourceKeys;
const buildSourceSummaries = (adapterSources, fetchedCounts, freshCounts, uniqueCounts, relevantCounts) => {
    const sources = (0, exports.unionSourceKeys)(adapterSources, Object.keys(fetchedCounts));
    // Per-source "stored" reflects items attempted for storage post-scoring, not the verified
    // per-source insert outcome — acceptable since insert failures are rare races, not the norm.
    return sources.map((source) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return ({
            source,
            fetched: (_a = fetchedCounts[source]) !== null && _a !== void 0 ? _a : 0,
            deduped: ((_b = freshCounts[source]) !== null && _b !== void 0 ? _b : 0) - ((_c = uniqueCounts[source]) !== null && _c !== void 0 ? _c : 0),
            discarded: ((_d = fetchedCounts[source]) !== null && _d !== void 0 ? _d : 0) - ((_e = freshCounts[source]) !== null && _e !== void 0 ? _e : 0) + (((_f = uniqueCounts[source]) !== null && _f !== void 0 ? _f : 0) - ((_g = relevantCounts[source]) !== null && _g !== void 0 ? _g : 0)),
            stored: (_h = relevantCounts[source]) !== null && _h !== void 0 ? _h : 0,
        });
    });
};
exports.buildSourceSummaries = buildSourceSummaries;
/**
 * Same per-source union as `buildSourceSummaries`, but broken into all six pipeline layers
 * (including semantic dedup, which the HTTP-facing summary doesn't surface) for persistence in
 * `IngestionRun`. Called for both a completed run and a run aborted mid-pipeline.
 *
 * Layers the pipeline never reached at abort time are passed as `undefined`, not `{}` — the two
 * are not equivalent. `{}` would mean "this layer ran and dropped everything," which is false and
 * would misrepresent a crash as a 100% drop. `undefined` means "unknown," so that layer's dropped
 * count is 0 and its item count carries forward unchanged from the last layer that did complete.
 */
const buildSourceRunCounts = (adapterSources, fetchedCounts, freshCounts, uniqueCounts, dedupedCounts, relevantCounts, errorsBySource, contentFetchedCounts, contentFailedCounts) => {
    const sources = (0, exports.unionSourceKeys)(adapterSources, Object.keys(fetchedCounts));
    return sources.map((source) => {
        var _a, _b, _c, _d, _e;
        const fetched = (_a = fetchedCounts[source]) !== null && _a !== void 0 ? _a : 0;
        const afterFresh = freshCounts ? ((_b = freshCounts[source]) !== null && _b !== void 0 ? _b : 0) : fetched;
        const afterUnique = uniqueCounts ? ((_c = uniqueCounts[source]) !== null && _c !== void 0 ? _c : 0) : afterFresh;
        const afterDeduped = dedupedCounts ? ((_d = dedupedCounts[source]) !== null && _d !== void 0 ? _d : 0) : afterUnique;
        const afterRelevant = relevantCounts ? ((_e = relevantCounts[source]) !== null && _e !== void 0 ? _e : 0) : afterDeduped;
        return {
            source,
            fetched,
            fresh_dropped: fetched - afterFresh,
            hash_deduped: afterFresh - afterUnique,
            semantic_deduped: afterUnique - afterDeduped,
            relevance_dropped: afterDeduped - afterRelevant,
            // Layer 4 (categorize + store) never even attempted this source unless relevance filtering
            // itself completed — reporting afterRelevant as "stored" here would claim items were stored
            // that the pipeline never got to.
            stored: relevantCounts ? afterRelevant : 0,
            error: errorsBySource[source],
            content_fetched: contentFetchedCounts === null || contentFetchedCounts === void 0 ? void 0 : contentFetchedCounts[source],
            content_failed: contentFailedCounts === null || contentFailedCounts === void 0 ? void 0 : contentFailedCounts[source],
        };
    });
};
exports.buildSourceRunCounts = buildSourceRunCounts;
/**
 * Persists one `IngestionRun` document per run — success or crash alike (see design.md decision
 * 1: a gap in run history reintroduces the exact "did this even run?" blind spot this capability
 * exists to close). Never throws: a failed write must not affect the pipeline's own outcome.
 */
const persistRun = (state) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const finished_at = new Date();
        const sources = (0, exports.buildSourceRunCounts)(state.adapterSources, state.fetchedCounts, state.freshCounts, state.uniqueCounts, state.dedupedCounts, state.relevantCounts, state.errorsBySource, state.contentFetchedCounts, state.contentFailedCounts);
        yield ingestionRun_model_1.IngestionRun.create({
            started_at: state.started_at,
            finished_at,
            duration_ms: finished_at.getTime() - state.started_at.getTime(),
            trigger: state.trigger,
            total_stored: state.totalStored,
            sources,
            error: state.topLevelError,
        });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] failed to persist IngestionRun');
    }
});
const runIngestionPipeline = (trigger) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const started_at = new Date();
    let adapterSources = [];
    let errorsBySource = {};
    let fetchedCounts = {};
    let freshCounts;
    let uniqueCounts;
    let dedupedCounts;
    let relevantCounts;
    let contentFetchedCounts;
    let contentFailedCounts;
    let totalStored = 0;
    try {
        // Layer 1: Fetch & Normalize
        const adapterResults = yield (0, adapters_1.runAllAdapters)();
        adapterSources = adapterResults.map((r) => r.source);
        errorsBySource = Object.fromEntries(adapterResults.filter((r) => Boolean(r.error)).map((r) => [r.source, r.error]));
        fetchedCounts = countBySource(adapterResults.flatMap((r) => r.items));
        // Layer 2: Dedupe & Freshness
        const hashed = (0, newsIngestion_utils_1.attachContentHash)(adapterResults.flatMap((r) => r.items));
        const fresh = (0, newsIngestion_utils_1.filterFresh)(hashed, config_1.default.news_ingestion.max_age_hours);
        freshCounts = countBySource(fresh);
        const unique = yield (0, newsIngestion_utils_1.dedupeAgainstStored)(fresh);
        uniqueCounts = countBySource(unique);
        // Layer 2b: Semantic Dedup (cross-source, same story under different URLs)
        const embedded = yield (0, newsIngestion_utils_1.embedItems)(unique);
        const dedupCutoff = new Date(Date.now() - config_1.default.news_ingestion.max_age_hours * 60 * 60 * 1000);
        const recentPool = yield (0, newsIngestion_utils_1.fetchRecentEmbeddings)(dedupCutoff);
        const deduped = (0, newsIngestion_utils_1.dedupeSemantic)(embedded, recentPool, config_1.default.news_ingestion.semantic_dedup_threshold);
        dedupedCounts = countBySource(deduped);
        logger_1.logger.info(`[NewsIngestion] semantic dedup: ${embedded.length} candidates -> ${deduped.length} survived ` +
            `(${embedded.length - deduped.length} dropped, recent pool size ${recentPool.length})`);
        // Layer 3: Relevance & Trend Scoring
        const brandVoicePool = yield (0, newsIngestion_scoring_1.fetchBrandVoicePool)();
        const scored = deduped.map((item) => (Object.assign(Object.assign({}, item), { relevance_score: (0, newsIngestion_scoring_1.scoreRelevance)(item.embedding, brandVoicePool), trend_score: (0, newsIngestion_scoring_1.scoreTrend)(item.raw_points, item.raw_comments, item.raw_stars_delta) })));
        // Cold start: skip relevance filtering entirely when no brand voice examples exist yet.
        const relevant = brandVoicePool.length === 0
            ? scored
            : scored.filter((item) => { var _a; return ((_a = item.relevance_score) !== null && _a !== void 0 ? _a : 0) >= config_1.default.news_ingestion.min_relevance; });
        relevantCounts = countBySource(relevant);
        // Layer 3b: Content Enrichment (link-only items still missing `content` after adapter-level
        // capture — see news-full-content-sources). Only survivors of relevance filtering are fetched.
        let enrichedRelevant = relevant;
        if (config_1.default.news_ingestion.content_fetch.enabled) {
            try {
                const enrichment = yield (0, newsIngestion_contentFetch_1.enrichContent)(relevant);
                enrichedRelevant = enrichment.items;
                contentFetchedCounts = {};
                contentFailedCounts = {};
                for (const [source, counts] of Object.entries(enrichment.countsBySource)) {
                    contentFetchedCounts[source] = counts.fetched;
                    contentFailedCounts[source] = counts.failed;
                }
            }
            catch (err) {
                logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] content enrichment failed — proceeding with unenriched items');
            }
        }
        // Layer 4: Categorize & Score Opportunity
        const categorized = yield (0, newsIngestion_categorize_1.categorizeBatch)(enrichedRelevant);
        const finalized = categorized.map((item) => (Object.assign(Object.assign({}, item), { opportunity_score: (0, newsIngestion_scoring_1.computeOpportunityScore)(item.relevance_score, item.trend_score, item.audience_fit, config_1.default.news_ingestion), needs_review: item.category_confidence < config_1.default.news_ingestion.category_confidence_threshold })));
        const payloads = finalized.map((item) => (Object.assign(Object.assign({ source: item.source, source_id: item.source_id, content_hash: item.content_hash, title: item.title, url: item.url, snippet: item.snippet }, (item.content_status === 'failed'
            ? { content_status: 'failed' }
            : (0, exports.withContentMeta)(item.content, config_1.default.news_ingestion.content_max_chars))), { published_at: item.published_at, engagement: {
                points: item.raw_points,
                comments: item.raw_comments,
                stars_delta: item.raw_stars_delta,
            }, trend_score: item.trend_score, category: item.category, relevance_score: item.relevance_score, impact_note: item.impact_note, embedding: item.embedding, opportunity_score: item.opportunity_score, category_confidence: item.category_confidence, needs_review: item.needs_review, processed: true })));
        if (payloads.length > 0) {
            try {
                const result = yield newsItem_model_1.NewsItem.insertMany(payloads, { ordered: false });
                totalStored = result.length;
            }
            catch (err) {
                // A duplicate-key race (another run inserted the same content_hash between our dedupe
                // check and this insert) is possible; ordered:false means every other document still
                // gets attempted, and mongoose reports the ones that succeeded here.
                const bulkErr = err;
                totalStored = (_b = (_a = bulkErr.insertedDocs) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
                logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] insertMany reported errors');
            }
        }
        const summaries = (0, exports.buildSourceSummaries)(adapterSources, fetchedCounts, freshCounts, uniqueCounts, relevantCounts);
        yield persistRun({
            started_at,
            trigger,
            adapterSources,
            fetchedCounts,
            freshCounts,
            uniqueCounts,
            dedupedCounts,
            relevantCounts,
            contentFetchedCounts,
            contentFailedCounts,
            errorsBySource,
            totalStored,
        });
        return { sources: summaries, totalStored };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield persistRun({
            started_at,
            trigger,
            adapterSources,
            fetchedCounts,
            freshCounts,
            uniqueCounts,
            dedupedCounts,
            relevantCounts,
            contentFetchedCounts,
            contentFailedCounts,
            errorsBySource,
            totalStored,
            topLevelError: message,
        });
        throw err;
    }
});
exports.runIngestionPipeline = runIngestionPipeline;
