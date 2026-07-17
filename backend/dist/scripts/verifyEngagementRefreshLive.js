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
const newsIngestion_service_1 = require("../app/modules/NewsIngestion/newsIngestion.service");
const newsRefresh_service_1 = require("../app/modules/NewsRefresh/newsRefresh.service");
const newsRefresh_fetchers_1 = require("../app/modules/NewsRefresh/newsRefresh.fetchers");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const maintenanceRun_model_1 = require("../app/modules/MaintenanceRun/maintenanceRun.model");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        yield mongoose_1.default.connect(config_1.default.database_url);
        console.log('--- 6.2: manual ingest, then engagement refresh ---');
        console.log(`Refreshable sources: ${newsRefresh_fetchers_1.REFRESHABLE_SOURCES.join(', ')}`);
        console.log('\nRunning manual ingestion...');
        const ingestSummary = yield (0, newsIngestion_service_1.runIngestionPipeline)('manual');
        console.log('Ingestion summary:', JSON.stringify(ingestSummary));
        console.log('\nRunning engagement refresh...');
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        const refreshed = yield newsItem_model_1.NewsItem.find({
            source: { $in: newsRefresh_fetchers_1.REFRESHABLE_SOURCES },
            engagement_refreshed_at: { $ne: null },
        })
            .sort({ engagement_refreshed_at: -1 })
            .limit(10)
            .select('source source_id engagement engagement_history engagement_refreshed_at source_removed')
            .lean();
        console.log(`\nItems with engagement_refreshed_at set: ${refreshed.length}`);
        for (const item of refreshed) {
            console.log(`  - [${item.source}] ${item.source_id}: history=${(_b = (_a = item.engagement_history) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0} snapshots, ` +
                `refreshed_at=${(_c = item.engagement_refreshed_at) === null || _c === void 0 ? void 0 : _c.toISOString()}, source_removed=${item.source_removed}`);
        }
        const hasTwoPlusSnapshots = refreshed.some((item) => { var _a, _b; return ((_b = (_a = item.engagement_history) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) >= 2; });
        console.log(`[6.2] At least one refreshed item has >=2 history snapshots: ${hasTwoPlusSnapshots ? 'PASS' : 'FAIL'}`);
        console.log(`[6.2] At least one item shows engagement_refreshed_at: ${refreshed.length > 0 ? 'PASS' : 'FAIL'}`);
        console.log('\n--- 6.3: maintenance_runs doc + TTL index ---');
        const latestRun = yield maintenanceRun_model_1.MaintenanceRun.findOne({ job: 'engagement_refresh' }).sort({ started_at: -1 }).lean();
        console.log('Latest engagement_refresh run doc:', JSON.stringify(latestRun, null, 2));
        const indexes = yield maintenanceRun_model_1.MaintenanceRun.collection.indexes();
        const ttlIndex = indexes.find((idx) => idx.key && idx.key.started_at === 1 && typeof idx.expireAfterSeconds === 'number');
        console.log('\nIndexes on maintenance_runs:', JSON.stringify(indexes));
        console.log(`[6.3] maintenance_runs document persisted: ${latestRun ? 'PASS' : 'FAIL'}`);
        console.log(`[6.3] TTL index on started_at (expireAfterSeconds=2592000) exists: ${ttlIndex ? 'PASS' : 'FAIL'}`);
        yield mongoose_1.default.disconnect();
        const ok = hasTwoPlusSnapshots && refreshed.length > 0 && !!latestRun && !!ttlIndex;
        process.exit(ok ? 0 : 1);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
