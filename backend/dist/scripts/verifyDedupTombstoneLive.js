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
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../app/config"));
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const newsDedupLedger_model_1 = require("../app/modules/NewsDedupLedger/newsDedupLedger.model");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const newsItem_service_1 = require("../app/modules/NewsItem/newsItem.service");
const newsIngestion_service_1 = require("../app/modules/NewsIngestion/newsIngestion.service");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose_1.default.connect(config_1.default.database_url);
        console.log('--- 4.2: resurrection test (delete a github_trending item, re-ingest, confirm no resurrection) ---');
        let target = yield newsItem_model_1.NewsItem.findOne({ source: 'github_trending' }).lean();
        if (!target) {
            console.log('No github_trending item stored yet — running ingestion once to seed one...');
            yield (0, newsIngestion_service_1.runIngestionPipeline)('manual');
            target = yield newsItem_model_1.NewsItem.findOne({ source: 'github_trending' }).lean();
        }
        if (!target) {
            console.log('[4.2] No github_trending item available even after ingestion — cannot run this check. SKIP');
        }
        else {
            console.log(`Target: "${target.title}" (${target.url}), content_hash=${target.content_hash}`);
            const deleted = yield newsItem_service_1.NewsItemService.deleteNewsItem(target._id.toString());
            console.log(`Deleted: ${deleted ? 'yes' : 'no'}`);
            const ledgerRow = yield newsDedupLedger_model_1.NewsDedupLedger.findOne({ content_hash: target.content_hash }).lean();
            console.log(`[4.2] Tombstone written before/at delete: ${ledgerRow ? 'PASS' : 'FAIL'}`);
            console.log('Running ingestion again (this may re-fetch the same trending repo if it is still trending)...');
            const summary = yield (0, newsIngestion_service_1.runIngestionPipeline)('manual');
            const ghSummary = summary.sources.find((s) => s.source === 'github_trending');
            console.log('github_trending run summary:', JSON.stringify(ghSummary));
            const resurrected = yield newsItem_model_1.NewsItem.findOne({ content_hash: target.content_hash }).lean();
            console.log(`[4.2] No live row exists with the deleted item's content_hash after re-ingestion (no resurrection): ${!resurrected ? 'PASS' : 'FAIL'}`);
        }
        console.log('\n--- 4.3: news_dedup_ledger TTL index ---');
        const indexes = yield newsDedupLedger_model_1.NewsDedupLedger.collection.indexes();
        const ttlIndex = indexes.find((idx) => idx.key && idx.key.deleted_at === 1 && typeof idx.expireAfterSeconds === 'number');
        console.log('Indexes on news_dedup_ledger:', JSON.stringify(indexes));
        console.log(`Configured NEWS_DEDUP_LEDGER_TTL_DAYS=${config_1.default.news_ingestion.dedup_ledger_ttl_days} (expireAfterSeconds should be ${config_1.default.news_ingestion.dedup_ledger_ttl_days * 86400})`);
        console.log(`[4.3] TTL index on deleted_at exists with matching expireAfterSeconds: ${(ttlIndex === null || ttlIndex === void 0 ? void 0 : ttlIndex.expireAfterSeconds) === config_1.default.news_ingestion.dedup_ledger_ttl_days * 86400 ? 'PASS' : 'FAIL'}`);
        yield mongoose_1.default.disconnect();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
