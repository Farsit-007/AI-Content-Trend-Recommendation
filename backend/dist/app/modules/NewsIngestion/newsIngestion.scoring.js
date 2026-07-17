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
exports.computeOpportunityScore = exports.hasEngagementSignal = exports.computeCurrentTrendScore = exports.scoreTrend = exports.scoreRelevance = exports.fetchBrandVoicePool = void 0;
const config_1 = __importDefault(require("../../config"));
const similarity_1 = require("../../lib/similarity");
const brandVoiceExample_model_1 = require("../BrandVoiceExample/brandVoiceExample.model");
const newsRefresh_fetchers_1 = require("../NewsRefresh/newsRefresh.fetchers");
const round1 = (n) => Math.round(n * 10) / 10;
const fetchBrandVoicePool = () => __awaiter(void 0, void 0, void 0, function* () {
    const examples = yield brandVoiceExample_model_1.BrandVoiceExample.find({}, { embedding: 1 });
    return examples.map((example) => example.embedding);
});
exports.fetchBrandVoicePool = fetchBrandVoicePool;
/**
 * Max similarity rather than average, so a small or lopsided brand-voice pool
 * (e.g. only one team has submitted examples) doesn't drag every item's score
 * down. Returns `undefined` when the pool is empty (cold start) so the caller
 * can skip relevance filtering rather than discarding everything.
 */
const scoreRelevance = (itemEmbedding, pool) => {
    if (pool.length === 0)
        return undefined;
    const best = Math.max(...pool.map((example) => (0, similarity_1.cosineSimilarity)(itemEmbedding, example)));
    return round1(Math.max(0, best) * 10);
};
exports.scoreRelevance = scoreRelevance;
/**
 * Log-scaled because raw engagement magnitudes vary wildly across sources
 * (HN points vs GitHub stars vs Reddit upvotes) — this keeps them comparable
 * on a single 0-10 scale without an LLM round-trip.
 */
const scoreTrend = (points, comments, starsDelta) => {
    const weighted = points + comments * 2 + starsDelta * 3 + 1;
    return round1(Math.min(10, Math.log10(weighted) * 3));
};
exports.scoreTrend = scoreTrend;
/** Same weighting as `scoreTrend`'s log argument (minus the `+1` floor), used to compare two
 * snapshots for velocity. */
const weightedEngagement = (e) => e.points + e.comments * 2 + e.stars_delta * 3;
/**
 * Decayed, velocity-aware live trend score (design.md decision 1). Pure and side-effect-free
 * so it can be called from any context (ingest, refresh job, a future corroboration merge)
 * without inheriting caller-specific state — `now` and the item snapshot are the only inputs.
 */
const computeCurrentTrendScore = (item, now) => {
    var _a, _b;
    const base = (0, exports.scoreTrend)(item.engagement.points, item.engagement.comments, item.engagement.stars_delta);
    const ageHours = (now.getTime() - ((_a = item.published_at) !== null && _a !== void 0 ? _a : item.created_at).getTime()) / 3600000;
    const decay = Math.exp(-ageHours / config_1.default.news_ingestion.trend_decay.tau_hours);
    const history = (_b = item.engagement_history) !== null && _b !== void 0 ? _b : [];
    let velocity = 0;
    if (history.length >= 2) {
        const last = history[history.length - 1];
        const prev = history[history.length - 2];
        const hoursBetween = Math.max((last.at.getTime() - prev.at.getTime()) / 3600000, 1);
        velocity = Math.max(0, (weightedEngagement(last) - weightedEngagement(prev)) / hoursBetween);
    }
    const score = base * decay + config_1.default.news_ingestion.trend_decay.velocity_bonus * Math.log10(1 + velocity);
    return round1(Math.min(10, Math.max(0, score)));
};
exports.computeCurrentTrendScore = computeCurrentTrendScore;
/**
 * True iff the item's engagement is trustworthy as a "this could still be trending" signal:
 * either its source supports cheap re-polling (so the number is kept fresh), or it already
 * shows nonzero weighted engagement (e.g. GitHub star deltas, which aren't re-polled but were
 * real at ingest). Not stored — derived on demand by callers (design.md decision 1).
 */
const hasEngagementSignal = (item) => newsRefresh_fetchers_1.REFRESHABLE_SOURCES.includes(item.source) || weightedEngagement(item.engagement) > 0;
exports.hasEngagementSignal = hasEngagementSignal;
/**
 * Deterministic so identical relevance/trend/fit inputs always produce the same score — the LLM
 * only supplies `audienceFit` (bounded 0-1); it no longer picks the final number itself.
 * `relevanceScore` is `undefined` during cold start (empty brand-voice pool), in which case the
 * configured fallback stands in for it.
 */
const computeOpportunityScore = (relevanceScore, trendScore, audienceFit, weights) => {
    const relevance = relevanceScore !== null && relevanceScore !== void 0 ? relevanceScore : weights.opportunity_fallback_relevance;
    const score = weights.opportunity_weight_relevance * relevance +
        weights.opportunity_weight_trend * trendScore +
        weights.opportunity_weight_fit * (audienceFit * 10);
    return round1(Math.min(10, Math.max(0, score)));
};
exports.computeOpportunityScore = computeOpportunityScore;
