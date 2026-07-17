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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTopOpportunities = exports.computeAudienceMatch = void 0;
const similarity_1 = require("../../lib/similarity");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const platformPost_model_1 = require("../PlatformPost/platformPost.model");
const PLATFORM_FORMAT_MAP = {
    AI: { platform: 'youtube', format: 'youtube_video_idea' },
    'Web Dev': { platform: 'facebook', format: 'facebook_reel_script' },
    Career: { platform: 'linkedin', format: 'linkedin_post' },
    Security: { platform: 'youtube', format: 'youtube_video_idea' },
    DevOps: { platform: 'linkedin', format: 'linkedin_post' },
    Other: { platform: 'facebook', format: 'facebook_post' },
};
/**
 * Computes audience match score: max cosine similarity between a news embedding
 * and a team's post embeddings, weighted by normalized engagement.
 */
const computeAudienceMatch = (newsEmbedding, teamPosts) => {
    if (teamPosts.length === 0)
        return 0;
    const maxEngagement = Math.max(...teamPosts.map((p) => p.engagement), 1);
    let weightedScore = 0;
    let totalWeight = 0;
    for (const post of teamPosts) {
        const sim = (0, similarity_1.cosineSimilarity)(newsEmbedding, post.embedding);
        const weight = post.engagement / maxEngagement;
        weightedScore += sim * weight;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weightedScore / totalWeight : 0;
};
exports.computeAudienceMatch = computeAudienceMatch;
const getTopOpportunities = (teamId_1, ...args_1) => __awaiter(void 0, [teamId_1, ...args_1], void 0, function* (teamId, limit = 5) {
    const [recentNews, teamPosts] = yield Promise.all([
        newsItem_model_1.NewsItem.find({ processed: true })
            .sort({ created_at: -1 })
            .limit(50)
            .select('title embedding trend_score opportunity_score category')
            .lean(),
        platformPost_model_1.PlatformPost.find({ team_id: teamId })
            .select('embedding metrics')
            .lean(),
    ]);
    const teamPostsWithEngagement = teamPosts.map((p) => ({
        embedding: p.embedding,
        engagement: p.metrics.likes + p.metrics.comments + p.metrics.shares,
    }));
    const hasEmbeddings = teamPostsWithEngagement.length > 0;
    const scored = recentNews.map((item) => {
        var _a, _b, _c, _d, _e;
        const audienceMatchScore = hasEmbeddings
            ? (0, exports.computeAudienceMatch)(item.embedding, teamPostsWithEngagement)
            : null;
        const score = audienceMatchScore !== null
            ? ((_a = item.trend_score) !== null && _a !== void 0 ? _a : 0) * audienceMatchScore
            : (_b = item.opportunity_score) !== null && _b !== void 0 ? _b : 0;
        const suggestion = (_d = PLATFORM_FORMAT_MAP[(_c = item.category) !== null && _c !== void 0 ? _c : 'Other']) !== null && _d !== void 0 ? _d : PLATFORM_FORMAT_MAP['Other'];
        return {
            news_item_id: item._id.toString(),
            title: item.title,
            audience_match_score: audienceMatchScore,
            trend_score: (_e = item.trend_score) !== null && _e !== void 0 ? _e : 0,
            combined_score: score,
            suggested_platform: suggestion.platform,
            suggested_format: suggestion.format,
        };
    });
    return scored
        .sort((a, b) => b.combined_score - a.combined_score)
        .slice(0, limit)
        .map((_a) => {
        var { combined_score: _ } = _a, rest = __rest(_a, ["combined_score"]);
        return rest;
    });
});
exports.getTopOpportunities = getTopOpportunities;
