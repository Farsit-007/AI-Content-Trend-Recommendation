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
const newsIngestion_service_1 = require("../app/modules/NewsIngestion/newsIngestion.service");
const ingestionRun_model_1 = require("../app/modules/IngestionRun/ingestionRun.model");
const db_1 = require("./support/db");
jest.mock('../app/modules/NewsIngestion/adapters');
jest.mock('../app/lib/embeddings');
jest.mock('../app/modules/NewsIngestion/newsIngestion.categorize');
jest.mock('../app/modules/NewsIngestion/newsIngestion.contentFetch');
const adapters_1 = require("../app/modules/NewsIngestion/adapters");
const embeddings_1 = require("../app/lib/embeddings");
const newsIngestion_categorize_1 = require("../app/modules/NewsIngestion/newsIngestion.categorize");
const newsIngestion_contentFetch_1 = require("../app/modules/NewsIngestion/newsIngestion.contentFetch");
const newsIngestion_service_2 = require("../app/modules/NewsIngestion/newsIngestion.service");
const config_1 = __importDefault(require("../app/config"));
const mockedRunAllAdapters = adapters_1.runAllAdapters;
const mockedEmbedBatch = embeddings_1.embedBatch;
const mockedCategorizeBatch = newsIngestion_categorize_1.categorizeBatch;
const mockedEnrichContent = newsIngestion_contentFetch_1.enrichContent;
const rawItem = (source, id, title = `Story ${id}`) => ({
    source,
    source_id: id,
    title,
    url: `https://example.test/${source}/${id}`,
    raw_points: 10,
    raw_comments: 2,
    raw_stars_delta: 0,
});
// One-hot vectors are pairwise orthogonal (cosine similarity 0), keeping every mocked embedBatch()
// call comfortably below the semantic-dedup threshold regardless of call order or input text.
const oneHotEmbedBatch = () => {
    let i = 0;
    return jest.fn().mockImplementation((texts) => __awaiter(void 0, void 0, void 0, function* () {
        return texts.map(() => {
            const v = Array(1536).fill(0);
            v[i % 1536] = 1;
            i += 1;
            return v;
        });
    }));
};
const passthroughCategorize = () => jest.fn().mockImplementation((items) => __awaiter(void 0, void 0, void 0, function* () {
    return items.map((item) => (Object.assign(Object.assign({}, item), { category: 'AI', impact_note: 'note', category_confidence: 0.9, audience_fit: 0.5 })));
}));
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
// Default: enrichment is a no-op pass-through, so tests unrelated to content enrichment are
// unaffected by it now sitting in the pipeline. Individual tests below override this.
beforeEach(() => {
    mockedEnrichContent.mockImplementation((items) => __awaiter(void 0, void 0, void 0, function* () { return ({ items, countsBySource: {} }); }));
});
describe('buildSourceRunCounts', () => {
    it('reports six-layer counts that sum to fetched when every layer completed', () => {
        const result = (0, newsIngestion_service_1.buildSourceRunCounts)(['hackernews'], { hackernews: 10 }, { hackernews: 8 }, { hackernews: 6 }, { hackernews: 5 }, { hackernews: 3 }, {});
        const row = result.find((r) => r.source === 'hackernews');
        expect(row).toMatchObject({ fetched: 10, fresh_dropped: 2, hash_deduped: 2, semantic_deduped: 1, relevance_dropped: 2, stored: 3 });
    });
    it('does not fabricate a 100% drop for layers the pipeline never reached', () => {
        // fresh/unique completed, but semantic dedup (and everything after it) never ran.
        const result = (0, newsIngestion_service_1.buildSourceRunCounts)(['hackernews'], { hackernews: 10 }, { hackernews: 8 }, { hackernews: 6 }, undefined, undefined, {});
        const row = result.find((r) => r.source === 'hackernews');
        expect(row).toMatchObject({ fetched: 10, fresh_dropped: 2, hash_deduped: 2, semantic_deduped: 0, relevance_dropped: 0, stored: 0 });
    });
    it('reports fetched-only counts when the pipeline died in Layer 1', () => {
        const result = (0, newsIngestion_service_1.buildSourceRunCounts)(['hackernews'], { hackernews: 10 }, undefined, undefined, undefined, undefined, {});
        const row = result.find((r) => r.source === 'hackernews');
        expect(row).toMatchObject({ fetched: 10, fresh_dropped: 0, hash_deduped: 0, semantic_deduped: 0, relevance_dropped: 0, stored: 0 });
    });
    it('attaches the adapter error string to its source row', () => {
        const result = (0, newsIngestion_service_1.buildSourceRunCounts)(['reddit'], {}, undefined, undefined, undefined, undefined, { reddit: 'HTTP 403' });
        expect(result.find((r) => r.source === 'reddit')).toMatchObject({ fetched: 0, error: 'HTTP 403' });
    });
});
describe('runIngestionPipeline persistence', () => {
    it('persists a complete run whose per-source counts sum to fetched, on success', () => __awaiter(void 0, void 0, void 0, function* () {
        mockedRunAllAdapters.mockResolvedValue([
            { source: 'hackernews', items: [rawItem('hackernews', '1'), rawItem('hackernews', '2')] },
        ]);
        mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
        mockedCategorizeBatch.mockImplementation(passthroughCategorize());
        const summary = yield (0, newsIngestion_service_2.runIngestionPipeline)('manual');
        expect(summary.totalStored).toBe(2);
        const runs = yield ingestionRun_model_1.IngestionRun.find();
        expect(runs).toHaveLength(1);
        const row = runs[0].sources.find((s) => s.source === 'hackernews');
        expect(row.fetched).toBe(2);
        expect(row.fresh_dropped + row.hash_deduped + row.semantic_deduped + row.relevance_dropped + row.stored).toBe(row.fetched);
        expect(row.stored).toBe(2);
        expect(runs[0].trigger).toBe('manual');
        expect(runs[0].error).toBeUndefined();
    }));
    it('persists a partial run and still throws when the pipeline crashes mid-layer', () => __awaiter(void 0, void 0, void 0, function* () {
        mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
        mockedEmbedBatch.mockRejectedValue(new Error('embedding blew up'));
        yield expect((0, newsIngestion_service_2.runIngestionPipeline)('manual')).rejects.toThrow('embedding blew up');
        const runs = yield ingestionRun_model_1.IngestionRun.find();
        expect(runs).toHaveLength(1);
        expect(runs[0].error).toBe('embedding blew up');
        const row = runs[0].sources.find((s) => s.source === 'hackernews');
        // Layer 1 and hash-dedup/freshness completed; semantic dedup (where embed() threw) never did.
        expect(row).toMatchObject({ fetched: 1, fresh_dropped: 0, hash_deduped: 0, semantic_deduped: 0, relevance_dropped: 0, stored: 0 });
    }));
    it('does not let a failed IngestionRun write change the pipeline outcome on success', () => __awaiter(void 0, void 0, void 0, function* () {
        mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
        mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
        mockedCategorizeBatch.mockImplementation(passthroughCategorize());
        const createSpy = jest.spyOn(ingestionRun_model_1.IngestionRun, 'create').mockRejectedValueOnce(new Error('mongo unavailable'));
        const summary = yield (0, newsIngestion_service_2.runIngestionPipeline)('manual');
        expect(summary.totalStored).toBe(1);
        createSpy.mockRestore();
    }));
    it('does not let a failed IngestionRun write mask the original error on a crash', () => __awaiter(void 0, void 0, void 0, function* () {
        mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
        mockedEmbedBatch.mockRejectedValue(new Error('embedding blew up'));
        const createSpy = jest.spyOn(ingestionRun_model_1.IngestionRun, 'create').mockRejectedValueOnce(new Error('mongo unavailable'));
        yield expect((0, newsIngestion_service_2.runIngestionPipeline)('manual')).rejects.toThrow('embedding blew up');
        createSpy.mockRestore();
    }));
    it('completes and stores items unenriched when content enrichment throws, rather than aborting', () => __awaiter(void 0, void 0, void 0, function* () {
        mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
        mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
        mockedCategorizeBatch.mockImplementation(passthroughCategorize());
        mockedEnrichContent.mockRejectedValueOnce(new Error('enrichment blew up'));
        const summary = yield (0, newsIngestion_service_2.runIngestionPipeline)('manual');
        expect(summary.totalStored).toBe(1);
        const runs = yield ingestionRun_model_1.IngestionRun.find();
        expect(runs[0].error).toBeUndefined();
    }));
    it('never invokes content enrichment when NEWS_CONTENT_FETCH_ENABLED is false', () => __awaiter(void 0, void 0, void 0, function* () {
        const originalEnabled = config_1.default.news_ingestion.content_fetch.enabled;
        config_1.default.news_ingestion.content_fetch.enabled = false;
        mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
        mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
        mockedCategorizeBatch.mockImplementation(passthroughCategorize());
        const summary = yield (0, newsIngestion_service_2.runIngestionPipeline)('manual');
        expect(summary.totalStored).toBe(1);
        expect(mockedEnrichContent).not.toHaveBeenCalled();
        config_1.default.news_ingestion.content_fetch.enabled = originalEnabled;
    }));
});
