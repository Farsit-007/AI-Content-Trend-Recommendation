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
exports.fetchConversationHistory = exports.fetchPerformanceContext = exports.fetchNewsContext = exports.rankNewsItems = void 0;
const similarity_1 = require("../../lib/similarity");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const contentGeneration_retrieval_1 = require("../ContentGeneration/contentGeneration.retrieval");
const platformPost_model_1 = require("../PlatformPost/platformPost.model");
const chat_model_1 = require("./chat.model");
const NEWS_TREND_POOL_SIZE = 30;
const NEWS_LIMIT = 5;
const HISTORY_LIMIT = 10;
/** Pure ranking step, kept separate from the DB fetch so it's testable without Mongo. */
const rankNewsItems = (candidates, questionEmbedding, limit = NEWS_LIMIT, poolSize = NEWS_TREND_POOL_SIZE) => {
    const topByTrend = candidates
        .slice()
        .sort((a, b) => b.trend_score - a.trend_score)
        .slice(0, poolSize);
    return topByTrend
        .map((item) => ({
        similarity: (0, similarity_1.cosineSimilarity)(questionEmbedding, item.embedding),
        item,
    }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(({ item }) => ({
        source: 'news_item',
        content: [
            `Title: ${item.title}`,
            item.category ? `Category: ${item.category}` : undefined,
            item.snippet ? `Snippet: ${item.snippet}` : undefined,
            item.content ? `Content: ${item.content.slice(0, 300)}` : undefined,
            item.impact_note ? `Impact: ${item.impact_note}` : undefined,
            `Trend score: ${item.trend_score}${item.opportunity_score !== undefined ? `, Opportunity score: ${item.opportunity_score}` : ''}`,
        ]
            .filter(Boolean)
            .join('\n'),
    }));
};
exports.rankNewsItems = rankNewsItems;
const fetchNewsContext = (questionEmbedding) => __awaiter(void 0, void 0, void 0, function* () {
    const items = yield newsItem_model_1.NewsItem.find({}, { title: 1, snippet: 1, content: 1, category: 1, impact_note: 1, trend_score: 1, opportunity_score: 1, embedding: 1 })
        .sort({ trend_score: -1 })
        .limit(NEWS_TREND_POOL_SIZE);
    return (0, exports.rankNewsItems)(items, questionEmbedding);
});
exports.fetchNewsContext = fetchNewsContext;
const fetchPerformanceContext = (teamId, questionEmbedding) => __awaiter(void 0, void 0, void 0, function* () {
    const posts = yield platformPost_model_1.PlatformPost.find({ team_id: teamId, content_snippet: { $exists: true, $ne: '' } }, { content_snippet: 1, embedding: 1, metrics: 1 });
    return (0, contentGeneration_retrieval_1.rankPlatformPosts)(posts.map((post) => ({
        content_snippet: post.content_snippet,
        embedding: post.embedding,
        metrics: post.metrics,
    })), questionEmbedding).map((example) => ({ source: 'platform_post', content: example.content }));
});
exports.fetchPerformanceContext = fetchPerformanceContext;
const fetchConversationHistory = (teamId_1, conversationId_1, ...args_1) => __awaiter(void 0, [teamId_1, conversationId_1, ...args_1], void 0, function* (teamId, conversationId, limit = HISTORY_LIMIT) {
    const messages = yield chat_model_1.ChatMessage.find({ team_id: teamId, conversation_id: conversationId })
        .sort({ created_at: -1 })
        .limit(limit);
    return messages.reverse();
});
exports.fetchConversationHistory = fetchConversationHistory;
