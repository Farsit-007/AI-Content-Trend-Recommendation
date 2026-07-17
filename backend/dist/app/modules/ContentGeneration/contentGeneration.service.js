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
exports.ContentGenerationService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const embeddings_1 = require("../../lib/embeddings");
const llmClient_1 = require("../../lib/llmClient");
const logger_1 = require("../../lib/logger");
const redis_1 = require("../../lib/redis");
const voiceProfile_1 = require("../../lib/voiceProfile");
const httpStatus_1 = require("../../utils/httpStatus");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const contentGeneration_prompt_1 = require("./contentGeneration.prompt");
const contentGeneration_parse_1 = require("./contentGeneration.parse");
const contentGeneration_retrieval_1 = require("./contentGeneration.retrieval");
const config_1 = __importDefault(require("../../config"));
const CONTENT_TTL = config_1.default.analytics.content_cache_ttl;
const buildCacheKey = (teamId, newsItemId, topic) => {
    const item = newsItemId !== null && newsItemId !== void 0 ? newsItemId : crypto_1.default.createHash('sha256').update(topic !== null && topic !== void 0 ? topic : '').digest('hex');
    return `content:${teamId}:${item}`;
};
const assertTeamAccess = (teamId, requestingUser) => {
    if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin')
        return;
    if (!requestingUser.team_ids.includes(teamId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
};
/** Soft-fail by design: a missing/invalid news_item_id falls back to embedding the topic text, not a request error. */
const resolveNewsItemContext = (newsItemId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!newsItemId)
        return {};
    const newsItem = yield newsItem_model_1.NewsItem.findById(newsItemId).catch(() => null);
    if (!newsItem) {
        logger_1.logger.warn(`[ContentGeneration] news_item_id "${newsItemId}" did not resolve — falling back to topic text`);
        return {};
    }
    return {
        embedding: newsItem.embedding,
        context: { category: newsItem.category, impact_note: newsItem.impact_note },
    };
});
const generateContent = (payload, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    assertTeamAccess(payload.team_id, requestingUser);
    const cacheKey = buildCacheKey(payload.team_id, payload.news_item_id, payload.topic);
    const cached = yield redis_1.redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    const [{ embedding: newsItemEmbedding, context: newsContext }, voiceOptions] = yield Promise.all([
        resolveNewsItemContext(payload.news_item_id),
        (0, voiceProfile_1.resolveVoiceOptions)(payload.team_id, payload.language),
    ]);
    const topicEmbedding = newsItemEmbedding !== null && newsItemEmbedding !== void 0 ? newsItemEmbedding : (yield (0, embeddings_1.embed)(payload.topic));
    const coldStart = !(yield (0, contentGeneration_retrieval_1.hasBrandVoiceExamples)(payload.team_id));
    const fewShotExamples = coldStart
        ? []
        : (yield Promise.all([
            (0, contentGeneration_retrieval_1.fetchTopBrandVoiceExamples)(payload.team_id, topicEmbedding),
            (0, contentGeneration_retrieval_1.fetchTopPerformingPosts)(payload.team_id, topicEmbedding),
        ])).flat();
    const messages = (0, contentGeneration_prompt_1.buildMessages)(payload.topic, fewShotExamples, voiceOptions, newsContext);
    let raw;
    try {
        raw = yield (0, llmClient_1.chatCompletion)({ model: llmClient_1.LLM_MODELS.content, messages, temperature: 0.7 });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[ContentGeneration] LLM call failed');
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_GATEWAY, 'Content generation failed — please try again');
    }
    const parsed = (0, contentGeneration_parse_1.parseGeneratedContent)(raw);
    if (!parsed) {
        logger_1.logger.error('[ContentGeneration] LLM response was not valid structured JSON');
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_GATEWAY, 'Content generation failed — please try again');
    }
    const result = Object.assign({ topic: payload.topic }, parsed);
    yield redis_1.redis.setex(cacheKey, CONTENT_TTL, JSON.stringify(result));
    return result;
});
exports.ContentGenerationService = {
    generateContent,
};
