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
// Shrink the decay constant for this run only, so decay is visible within a few seconds of
// wall-clock time instead of requiring hours — set before any other import touches config.
process.env.NEWS_TREND_DECAY_TAU_HOURS = '0.01'; // ~36s half-life-ish window
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../app/config"));
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const redis_1 = require("../app/lib/redis");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const newsItem_service_1 = require("../app/modules/NewsItem/newsItem.service");
const newsRefresh_service_1 = require("../app/modules/NewsRefresh/newsRefresh.service");
// Strict-decrease-across-two-cycles is proven deterministically (fake timers, no external API
// flakiness) by newsRefresh.integration.test.ts — this live script instead checks the two things
// only a real Atlas run + the real service layer can confirm: backfill against real data, and the
// feed's default-sort plumbing actually reading current_trend_score end to end.
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose_1.default.connect(config_1.default.database_url);
        console.log(`Using NEWS_TREND_DECAY_TAU_HOURS=${config_1.default.news_ingestion.trend_decay.tau_hours} (shrunk for this verification run)\n`);
        console.log('--- 4.3: backfill for a pre-existing (unscored) row ---');
        const anyItem = yield newsItem_model_1.NewsItem.findOne({}).lean();
        if (!anyItem)
            throw new Error('No news items in DB — run ingestion first (npm run verify:engagement-refresh-live)');
        yield newsItem_model_1.NewsItem.updateOne({ _id: anyItem._id }, { $unset: { current_trend_score: 1 } });
        const beforeBackfill = yield newsItem_model_1.NewsItem.findById(anyItem._id).lean();
        console.log(`Cleared current_trend_score on item ${anyItem._id} — now: ${beforeBackfill === null || beforeBackfill === void 0 ? void 0 : beforeBackfill.current_trend_score}`);
        yield redis_1.redis.del('lock:news_refresh'); // in case a prior run's lock is still held
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        const afterBackfill = yield newsItem_model_1.NewsItem.findById(anyItem._id).lean();
        const backfilled = (afterBackfill === null || afterBackfill === void 0 ? void 0 : afterBackfill.current_trend_score) !== undefined && (afterBackfill === null || afterBackfill === void 0 ? void 0 : afterBackfill.current_trend_score) !== null;
        console.log(`After one refresh run: current_trend_score = ${afterBackfill === null || afterBackfill === void 0 ? void 0 : afterBackfill.current_trend_score}`);
        console.log(`[4.3] Pre-existing unscored row got backfilled: ${backfilled ? 'PASS' : 'FAIL'}`);
        console.log('\n--- 4.2: feed default sort uses current_trend_score, explicit sort unchanged ---');
        const { result: defaultSorted } = yield newsItem_service_1.NewsItemService.getAllNewsItems({ limit: '10' });
        const scores = defaultSorted.map((item) => {
            var _a;
            return (_a = item.current_trend_score) !== null && _a !== void 0 ? _a : item.trend_score;
        });
        const isDescending = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
        console.log('Default-sort (no ?sort) page 1 scores:', scores);
        console.log(`[4.2] Default-sort page 1 is ordered by current_trend_score descending: ${isDescending ? 'PASS' : 'FAIL'}`);
        const { result: explicitSorted } = yield newsItem_service_1.NewsItemService.getAllNewsItems({ sort: '-created_at', limit: '10' });
        const createdDates = explicitSorted.map((item) => item.created_at.getTime());
        const isCreatedDescending = createdDates.every((d, i) => i === 0 || createdDates[i - 1] >= d);
        console.log(`[4.2] Explicit ?sort=-created_at still honored (created_at descending): ${isCreatedDescending ? 'PASS' : 'FAIL'}`);
        yield mongoose_1.default.disconnect();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
