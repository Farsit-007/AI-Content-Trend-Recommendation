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
exports.fetchStackOverflow = void 0;
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
const htmlText_1 = require("./htmlText");
const BASE_URL = 'https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=25';
const fetchStackOverflow = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { stackexchange_key } = config_1.default.news_ingestion;
    const url = stackexchange_key ? `${BASE_URL}&key=${stackexchange_key}` : BASE_URL;
    const res = yield fetch(url);
    const body = (yield res.json());
    if (!res.ok || !Array.isArray(body.items)) {
        throw new Error(`Stack Exchange request failed: ${(_a = body.error_message) !== null && _a !== void 0 ? _a : res.status}`);
    }
    // At this pipeline's call volume (1 request/run) backoff should never fire; never sleep on it —
    // that would block this adapter's slot in the run's Promise.all for an unrelated reason.
    if (body.backoff) {
        logger_1.logger.warn(`[NewsIngestion] Stack Exchange requested a backoff of ${body.backoff}s (not honored — call volume is far below quota)`);
    }
    return body.items.map((question) => ({
        source: 'stackoverflow',
        source_id: String(question.question_id),
        title: (0, htmlText_1.decodeEntities)(question.title),
        url: question.link,
        snippet: question.tags.join(', '),
        published_at: new Date(question.creation_date * 1000),
        raw_points: question.score,
        raw_comments: question.answer_count,
        raw_stars_delta: 0,
    }));
});
exports.fetchStackOverflow = fetchStackOverflow;
