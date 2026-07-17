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
exports.generateBanglishInsight = void 0;
const llmClient_1 = require("../../lib/llmClient");
const logger_1 = require("../../lib/logger");
const generateBanglishInsight = (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    const platformSummary = ctx.platforms
        .filter((p) => p.status === 'ok' && p.overview)
        .map((p) => `${p.platform}: reach ${p.overview.reach}, engagements ${p.overview.engagements}`)
        .join('; ');
    const messages = [
        {
            role: 'system',
            content: 'You are a Bangladeshi social media strategist. Write in Banglish (Bengali + English mixed, as used on Facebook/YouTube). Be specific, data-driven, and actionable. Maximum 3 sentences.',
        },
        {
            role: 'user',
            content: `আমাদের last 30 দিনের data:
- Total reach: ${ctx.overview.reach.toLocaleString()} (${ctx.overview.delta.reach > 0 ? '+' : ''}${ctx.overview.delta.reach}% vs আগের মাস)
- Total engagements: ${ctx.overview.engagements.toLocaleString()} (${ctx.overview.delta.engagements > 0 ? '+' : ''}${ctx.overview.delta.engagements}%)
- Engagement rate: ${ctx.overview.engagement_rate}%
${platformSummary ? `- Platforms: ${platformSummary}` : ''}
${ctx.topOpportunity ? `- Top opportunity: "${ctx.topOpportunity.title}" (${ctx.topOpportunity.suggested_platform})` : ''}

এই data দেখে 2-3 sentence এ বলো আমাদের performance কেমন ছিল এবং next month এ কী focus করা উচিত।`,
        },
    ];
    try {
        return yield (0, llmClient_1.chatCompletion)({ model: llmClient_1.LLM_MODELS.standard, messages, temperature: 0.6 });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[Report] LLM insight generation failed');
        return null;
    }
});
exports.generateBanglishInsight = generateBanglishInsight;
