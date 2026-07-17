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
exports.runAutoGeneration = void 0;
const logger_1 = require("../../lib/logger");
const config_1 = __importDefault(require("../../config"));
const llmClient_1 = require("../../lib/llmClient");
const brandVoiceExample_model_1 = require("../BrandVoiceExample/brandVoiceExample.model");
const contentGeneration_service_1 = require("../ContentGeneration/contentGeneration.service");
const newsItem_model_1 = require("../NewsItem/newsItem.model");
const team_model_1 = require("../Team/team.model");
const generatedContent_model_1 = require("./generatedContent.model");
const TOP_NEWS_PER_TEAM = 3;
const makeAdminUser = (teamId) => ({
    id: 'system',
    email: 'system@growth-studio.internal',
    role: 'admin',
    team_ids: [teamId],
});
const runAutoGeneration = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const summary = { teams_processed: 0, drafts_created: 0, skipped: 0 };
    const maxRun = config_1.default.auto_generation.max_per_run;
    let callsUsed = 0;
    const teamsQuery = teamId ? team_model_1.Team.find({ _id: teamId }) : team_model_1.Team.find();
    const teams = yield teamsQuery.select('_id name').lean();
    for (const team of teams) {
        const tid = team._id.toString();
        try {
            const hasExamples = yield brandVoiceExample_model_1.BrandVoiceExample.exists({ team_id: tid });
            if (!hasExamples) {
                logger_1.logger.info(`[auto-gen] team "${team.name}" (${tid}): skipped — no brand voice examples`);
                summary.skipped += 1;
                continue;
            }
            const topNews = yield newsItem_model_1.NewsItem.find({ lifecycle: { $ne: 'archived' } })
                .sort({ opportunity_score: -1, current_trend_score: -1, trend_score: -1 })
                .limit(TOP_NEWS_PER_TEAM)
                .select('_id title category impact_note')
                .lean();
            let teamDrafts = 0;
            for (const newsItem of topNews) {
                if (callsUsed >= maxRun)
                    break;
                const newsItemId = newsItem._id.toString();
                const alreadyDrafted = yield generatedContent_model_1.GeneratedContent.exists({ team_id: tid, news_item_id: newsItemId });
                if (alreadyDrafted) {
                    summary.skipped += 1;
                    continue;
                }
                const topic = (_b = (_a = newsItem.title) !== null && _a !== void 0 ? _a : newsItem.category) !== null && _b !== void 0 ? _b : newsItemId;
                const result = yield contentGeneration_service_1.ContentGenerationService.generateContent({ team_id: tid, topic, news_item_id: newsItemId }, makeAdminUser(tid));
                yield generatedContent_model_1.GeneratedContent.create({
                    team_id: tid,
                    news_item_id: newsItemId,
                    topic: result.topic,
                    formats: {
                        facebook_post: result.facebook_post,
                        facebook_reel_script: result.facebook_reel_script,
                        linkedin_post: result.linkedin_post,
                        youtube_idea: result.youtube_idea,
                        caption: result.caption,
                    },
                    source: 'auto',
                    status: 'draft',
                    model_used: llmClient_1.LLM_MODELS.content,
                });
                callsUsed += 1;
                teamDrafts += 1;
                summary.drafts_created += 1;
            }
            if (teamDrafts > 0 || topNews.length > 0) {
                summary.teams_processed += 1;
            }
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[auto-gen] team "${team.name}" (${tid}) failed`);
        }
        if (callsUsed >= maxRun) {
            logger_1.logger.info(`[auto-gen] quota cap reached (${maxRun} calls) — stopping early`);
            break;
        }
    }
    return summary;
});
exports.runAutoGeneration = runAutoGeneration;
