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
const embeddings_1 = require("../app/lib/embeddings");
const newsIngestion_utils_1 = require("../app/modules/NewsIngestion/newsIngestion.utils");
const rawItem = (sourceId, title, snippet, points) => ({
    source: 'live-verify',
    source_id: sourceId,
    content_hash: `live-verify:${sourceId}`,
    title,
    url: `https://example.com/${sourceId}`,
    snippet,
    raw_points: points,
    raw_comments: 0,
    raw_stars_delta: 0,
});
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield mongoose_1.default.connect(config_1.default.database_url);
        const candidates = [
            rawItem('a-hn', 'OpenAI releases GPT-5.5 with major reasoning improvements', 'The new model shows significant gains on math and coding benchmarks compared to its predecessor.', 50),
            rawItem('b-devto', 'GPT-5.5 launches from OpenAI, bringing big reasoning upgrades', 'OpenAI just shipped an updated model with large improvements to math and coding benchmark performance.', 300),
            rawItem('c-reddit', 'Show HN: I built a CLI tool to manage dotfiles across machines', 'A small Rust utility that syncs your shell config, vim settings, and aliases between computers.', 12),
        ];
        console.log('Embedding 3 candidate items via real OpenRouter embeddings...');
        const embedded = yield Promise.all(candidates.map((item) => __awaiter(this, void 0, void 0, function* () { return (Object.assign(Object.assign({}, item), { embedding: yield (0, embeddings_1.embed)(`${item.title} ${item.snippet}`.trim()) })); })));
        const sim = (a, b) => {
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < a.length; i++) {
                dot += a[i] * b[i];
                na += a[i] * a[i];
                nb += b[i] * b[i];
            }
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
        };
        console.log(`Cosine similarity — GPT-5.5 (HN) vs GPT-5.5 (Dev.to): ${sim(embedded[0].embedding, embedded[1].embedding).toFixed(4)}`);
        console.log(`Cosine similarity — GPT-5.5 (HN) vs dotfiles CLI (unrelated): ${sim(embedded[0].embedding, embedded[2].embedding).toFixed(4)}`);
        const cutoff = new Date(Date.now() - config_1.default.news_ingestion.max_age_hours * 60 * 60 * 1000);
        const recentPool = yield (0, newsIngestion_utils_1.fetchRecentEmbeddings)(cutoff);
        console.log(`Recently-stored pool size (real NewsItem docs, last ${config_1.default.news_ingestion.max_age_hours}h): ${recentPool.length}`);
        const threshold = config_1.default.news_ingestion.semantic_dedup_threshold;
        console.log(`Threshold: ${threshold}`);
        const survivors = (0, newsIngestion_utils_1.dedupeSemantic)(embedded, recentPool, threshold);
        console.log(`\n3 candidates in -> ${survivors.length} survived semantic dedup:`);
        survivors.forEach((s) => console.log(`  - ${s.source_id}: "${s.title}"`));
        const survivedIds = new Set(survivors.map((s) => s.source_id));
        const gptDuplicateCollapsed = survivedIds.has('a-hn') !== survivedIds.has('b-devto');
        const higherEngagementKept = survivedIds.has('b-devto') && !survivedIds.has('a-hn');
        const distinctSurvived = survivedIds.has('c-reddit');
        console.log('\n--- Results ---');
        console.log(`[5.1] Near-duplicate pair (HN "a", Dev.to "b") collapsed to one: ${gptDuplicateCollapsed ? 'PASS' : 'FAIL'}`);
        console.log(`      Higher-engagement one (Dev.to, 300 points) kept over HN (50 points): ${higherEngagementKept ? 'PASS' : 'FAIL'}`);
        console.log(`[5.2] Distinct unrelated item (dotfiles CLI) survived untouched: ${distinctSurvived ? 'PASS' : 'FAIL'}`);
        yield mongoose_1.default.disconnect();
        process.exit(gptDuplicateCollapsed && higherEngagementKept && distinctSurvived ? 0 : 1);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
