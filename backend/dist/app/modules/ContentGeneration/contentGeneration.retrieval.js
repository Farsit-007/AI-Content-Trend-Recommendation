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
exports.fetchTopPerformingPosts = exports.fetchTopBrandVoiceExamples = exports.rankPlatformPosts = exports.rankBrandVoiceExamples = exports.hasBrandVoiceExamples = void 0;
const similarity_1 = require("../../lib/similarity");
const brandVoiceExample_model_1 = require("../BrandVoiceExample/brandVoiceExample.model");
const platformPost_model_1 = require("../PlatformPost/platformPost.model");
const BRAND_VOICE_LIMIT = 3;
const PLATFORM_POST_ENGAGEMENT_POOL_SIZE = 20;
const PLATFORM_POST_LIMIT = 3;
/** Zero brand-voice examples is the cold-start signal — callers skip all retrieval on this. */
const hasBrandVoiceExamples = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const count = yield brandVoiceExample_model_1.BrandVoiceExample.countDocuments({ team_id: teamId });
    return count > 0;
});
exports.hasBrandVoiceExamples = hasBrandVoiceExamples;
/** Pure ranking step, kept separate from the DB fetch so it's testable without Mongo. */
const rankBrandVoiceExamples = (candidates, topicEmbedding, limit = BRAND_VOICE_LIMIT) => candidates
    .map((candidate) => ({
    similarity: (0, similarity_1.cosineSimilarity)(topicEmbedding, candidate.embedding),
    content: candidate.content,
    engagement_hint: candidate.engagement_hint,
}))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ content, engagement_hint }) => ({
    source: 'brand_voice_example',
    content,
    engagement_hint,
}));
exports.rankBrandVoiceExamples = rankBrandVoiceExamples;
/**
 * Linear ranking score used only to pick the top-N candidate pool before similarity
 * ranking — never shown to the user, unlike newsIngestion.scoring.ts's 0-10 display scores.
 * Comments/shares weighted highest since they're the most active engagement signals.
 */
const engagementScore = (metrics) => metrics.reach + metrics.likes * 2 + metrics.comments * 3 + metrics.shares * 4;
/** Pure two-stage ranking (top-N by engagement, then top-M by similarity), testable without Mongo. */
const rankPlatformPosts = (candidates, topicEmbedding, limit = PLATFORM_POST_LIMIT, engagementPoolSize = PLATFORM_POST_ENGAGEMENT_POOL_SIZE) => {
    const topByEngagement = candidates
        .slice()
        .sort((a, b) => engagementScore(b.metrics) - engagementScore(a.metrics))
        .slice(0, engagementPoolSize);
    return topByEngagement
        .map((post) => ({
        similarity: (0, similarity_1.cosineSimilarity)(topicEmbedding, post.embedding),
        content: post.content_snippet,
    }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(({ content }) => ({
        source: 'platform_post',
        content,
    }));
};
exports.rankPlatformPosts = rankPlatformPosts;
const fetchTopBrandVoiceExamples = (teamId, topicEmbedding) => __awaiter(void 0, void 0, void 0, function* () {
    const examples = yield brandVoiceExample_model_1.BrandVoiceExample.find({ team_id: teamId }, { content: 1, embedding: 1, engagement_hint: 1 });
    return (0, exports.rankBrandVoiceExamples)(examples, topicEmbedding);
});
exports.fetchTopBrandVoiceExamples = fetchTopBrandVoiceExamples;
const fetchTopPerformingPosts = (teamId, topicEmbedding) => __awaiter(void 0, void 0, void 0, function* () {
    const posts = yield platformPost_model_1.PlatformPost.find({ team_id: teamId, content_snippet: { $exists: true, $ne: '' } }, { content_snippet: 1, embedding: 1, metrics: 1 });
    return (0, exports.rankPlatformPosts)(posts.map((post) => ({
        content_snippet: post.content_snippet,
        embedding: post.embedding,
        metrics: post.metrics,
    })), topicEmbedding);
});
exports.fetchTopPerformingPosts = fetchTopPerformingPosts;
