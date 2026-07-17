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
exports.categorizeBatch = void 0;
const llmClient_1 = require("../../lib/llmClient");
const logger_1 = require("../../lib/logger");
const newsIngestion_interface_1 = require("./newsIngestion.interface");
const BATCH_SIZE = 10;
const isValidCategory = (category) => newsIngestion_interface_1.NEWS_CATEGORIES.includes(category);
const isUnitInterval = (n) => typeof n === 'number' && n >= 0 && n <= 1;
// Cold, low-confidence fallback so a parse/validation failure never masquerades as a real
// AI judgment — this drives `needs_review: true` and a fit derived from relevance alone.
const fallbackCategorize = (item) => {
    var _a;
    return (Object.assign(Object.assign({}, item), { category: 'Other', impact_note: 'Automatically ingested — category/opportunity scoring unavailable for this item.', category_confidence: 0, audience_fit: ((_a = item.relevance_score) !== null && _a !== void 0 ? _a : 0) / 10 }));
};
const parseLlmResponse = (raw) => {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : null;
    }
    catch (_a) {
        return null;
    }
};
const categorizeOneBatch = (batch) => __awaiter(void 0, void 0, void 0, function* () {
    const prompt = batch
        .map((item, id) => { var _a, _b; return `${id}. "${item.title}" — ${(_a = item.snippet) !== null && _a !== void 0 ? _a : 'no snippet'} (relevance_score=${(_b = item.relevance_score) !== null && _b !== void 0 ? _b : 'n/a'}, trend_score=${item.trend_score})`; })
        .join('\n');
    let raw;
    try {
        raw = yield (0, llmClient_1.chatCompletion)({
            model: llmClient_1.LLM_MODELS.standard,
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content: 'You categorize tech news items for a social media growth team. Respond with ONLY a strict JSON array, ' +
                        'no markdown fences, no commentary. Each element must be: ' +
                        '{ "id": <number>, "category": one of "AI"|"Web Dev"|"Career"|"Security"|"DevOps"|"Other", ' +
                        '"impact_note": "<one sentence on audience fit>", "confidence": <number 0-1, how sure you are of the category>, ' +
                        '"audience_fit": <number 0-1, how well this topic fits a growth/social content team\'s audience, ' +
                        'independent of how trendy or on-brand it already scored> }. ' +
                        'Include exactly one element per input item, using the same id.',
                },
                { role: 'user', content: prompt },
            ],
        });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] Categorization LLM call failed');
        return batch.map(fallbackCategorize);
    }
    const parsed = parseLlmResponse(raw);
    if (!parsed) {
        logger_1.logger.error('[NewsIngestion] Categorization response was not valid JSON, falling back for entire batch');
        return batch.map(fallbackCategorize);
    }
    const byId = new Map(parsed.map((entry) => [entry.id, entry]));
    return batch.map((item, id) => {
        var _a;
        const result = byId.get(id);
        if (!result || !isValidCategory(result.category)) {
            return fallbackCategorize(item);
        }
        const fallback = fallbackCategorize(item);
        return Object.assign(Object.assign({}, item), { category: result.category, impact_note: (_a = result.impact_note) !== null && _a !== void 0 ? _a : fallback.impact_note, category_confidence: isUnitInterval(result.confidence) ? result.confidence : fallback.category_confidence, audience_fit: isUnitInterval(result.audience_fit) ? result.audience_fit : fallback.audience_fit });
    });
});
const categorizeBatch = (items) => __awaiter(void 0, void 0, void 0, function* () {
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        batches.push(items.slice(i, i + BATCH_SIZE));
    }
    const results = yield Promise.all(batches.map(categorizeOneBatch));
    return results.flat();
});
exports.categorizeBatch = categorizeBatch;
