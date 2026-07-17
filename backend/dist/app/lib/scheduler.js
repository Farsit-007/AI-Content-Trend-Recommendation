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
exports.startAutoGenerationScheduler = exports.startAnalyticsScheduler = exports.startNewsIngestionScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const config_1 = __importDefault(require("../config"));
const logger_1 = require("./logger");
const generatedContent_job_1 = require("../modules/GeneratedContent/generatedContent.job");
const newsIngestion_service_1 = require("../modules/NewsIngestion/newsIngestion.service");
const analytics_service_1 = require("../modules/Analytics/analytics.service");
/**
 * Runs in-process rather than as a separate worker — acceptable at this scale
 * (a handful of LLM calls every few hours). A failed run must not crash the
 * API server, so the whole callback is try/caught and only logged.
 */
const startNewsIngestionScheduler = () => {
    node_cron_1.default.schedule(config_1.default.news_ingestion.cron, () => __awaiter(void 0, void 0, void 0, function* () {
        logger_1.logger.info('[scheduler] Running scheduled news ingestion...');
        try {
            const summary = yield (0, newsIngestion_service_1.runIngestionPipeline)('cron');
            logger_1.logger.info({ summary }, '[scheduler] News ingestion complete');
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] News ingestion failed');
        }
    }));
    logger_1.logger.info(`[scheduler] News ingestion scheduled: ${config_1.default.news_ingestion.cron}`);
};
exports.startNewsIngestionScheduler = startNewsIngestionScheduler;
const startAnalyticsScheduler = () => {
    node_cron_1.default.schedule(config_1.default.analytics.refresh_cron, () => __awaiter(void 0, void 0, void 0, function* () {
        logger_1.logger.info('[scheduler] Running scheduled analytics refresh...');
        try {
            const summary = yield (0, analytics_service_1.runAnalyticsRefresh)();
            logger_1.logger.info({ summary }, '[scheduler] Analytics refresh complete');
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] Analytics refresh failed');
        }
    }));
    logger_1.logger.info(`[scheduler] Analytics refresh scheduled: ${config_1.default.analytics.refresh_cron}`);
};
exports.startAnalyticsScheduler = startAnalyticsScheduler;
const startAutoGenerationScheduler = () => {
    node_cron_1.default.schedule(config_1.default.auto_generation.cron, () => __awaiter(void 0, void 0, void 0, function* () {
        logger_1.logger.info('[scheduler] Running scheduled auto-generation...');
        try {
            const summary = yield (0, generatedContent_job_1.runAutoGeneration)();
            logger_1.logger.info({ summary }, '[scheduler] Auto-generation complete');
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] Auto-generation failed');
        }
    }));
    logger_1.logger.info(`[scheduler] Auto-generation scheduled: ${config_1.default.auto_generation.cron}`);
};
exports.startAutoGenerationScheduler = startAutoGenerationScheduler;
