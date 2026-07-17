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
exports.computeOpportunityScore = exports.scoreTrend = exports.scoreRelevance = exports.fetchBrandVoicePool = void 0;
const similarity_1 = require("../../lib/similarity");
const brandVoiceExample_model_1 = require("../BrandVoiceExample/brandVoiceExample.model");
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
