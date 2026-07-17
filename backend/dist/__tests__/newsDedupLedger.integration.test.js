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
const config_1 = __importDefault(require("../app/config"));
const newsIngestion_utils_1 = require("../app/modules/NewsIngestion/newsIngestion.utils");
const newsDedupLedger_model_1 = require("../app/modules/NewsDedupLedger/newsDedupLedger.model");
const newsDedupLedger_service_1 = require("../app/modules/NewsDedupLedger/newsDedupLedger.service");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const newsItem_service_1 = require("../app/modules/NewsItem/newsItem.service");
const db_1 = require("./support/db");
const fixtures_1 = require("./support/fixtures");
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
const seedNewsItem = (overrides = {}) => newsItem_model_1.NewsItem.create(Object.assign({ source: 'github_trending', source_id: `gh-${Math.random()}`, content_hash: `hash-${Math.random()}`, title: 'A trending repo', url: `https://example.test/${Math.random()}`, embedding: (0, fixtures_1.testEmbedding)(), needs_review: false, processed: true }, overrides));
const hashedCandidate = (content_hash) => ({
    source: 'github_trending',
    source_id: 'candidate',
    content_hash,
    title: 'Same repo, re-fetched',
    url: 'https://example.test/candidate',
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: 0,
});
describe('recordTombstones', () => {
    it('is idempotent on a duplicate content_hash', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = { content_hash: 'dup-hash', title: 'A', source: 'hackernews' };
        yield (0, newsDedupLedger_service_1.recordTombstones)([item]);
        yield expect((0, newsDedupLedger_service_1.recordTombstones)([item])).resolves.not.toThrow();
        expect(yield newsDedupLedger_model_1.NewsDedupLedger.countDocuments({ content_hash: 'dup-hash' })).toBe(1);
    }));
    it('rethrows a non-duplicate-key error', () => __awaiter(void 0, void 0, void 0, function* () {
        jest.spyOn(newsDedupLedger_model_1.NewsDedupLedger, 'insertMany').mockRejectedValueOnce(new Error('connection reset'));
        yield expect((0, newsDedupLedger_service_1.recordTombstones)([{ content_hash: 'x', title: 'A', source: 'hackernews' }])).rejects.toThrow('connection reset');
    }));
    it('no-ops on an empty array', () => __awaiter(void 0, void 0, void 0, function* () {
        yield expect((0, newsDedupLedger_service_1.recordTombstones)([])).resolves.toBeUndefined();
        expect(yield newsDedupLedger_model_1.NewsDedupLedger.countDocuments({})).toBe(0);
    }));
});
describe('dedupeAgainstStored with the tombstone ledger', () => {
    it('drops a candidate whose hash matches a ledger tombstone even with no live row', () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, newsDedupLedger_service_1.recordTombstones)([{ content_hash: 'tombstoned-hash', title: 'Gone', source: 'github_trending' }]);
        const result = yield (0, newsIngestion_utils_1.dedupeAgainstStored)([hashedCandidate('tombstoned-hash')]);
        expect(result).toHaveLength(0);
    }));
    it('still drops a candidate matching a live stored item with no ledger tombstone (regression guard)', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem({ content_hash: 'live-hash' });
        const result = yield (0, newsIngestion_utils_1.dedupeAgainstStored)([hashedCandidate(item.content_hash)]);
        expect(result).toHaveLength(0);
    }));
    it('lets a genuinely new candidate through when neither store nor ledger has its hash', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield (0, newsIngestion_utils_1.dedupeAgainstStored)([hashedCandidate('brand-new-hash')]);
        expect(result).toHaveLength(1);
        expect(result[0].content_hash).toBe('brand-new-hash');
    }));
    it('fails open (stored-item dedup only) when the ledger query rejects', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem({ content_hash: 'live-hash-2' });
        jest.spyOn(newsDedupLedger_model_1.NewsDedupLedger, 'find').mockImplementationOnce(() => {
            throw new Error('ledger unavailable');
        });
        const result = yield (0, newsIngestion_utils_1.dedupeAgainstStored)([hashedCandidate(item.content_hash), hashedCandidate('new-hash-2')]);
        // The live item's hash is still caught by the stored-item query; only the ledger check degraded.
        expect(result.map((r) => r.content_hash)).toEqual(['new-hash-2']);
    }));
});
describe('deleteNewsItem tombstones before deleting', () => {
    it('writes a ledger row that then blocks re-ingestion of the same hash', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem({ content_hash: 'deleted-item-hash' });
        const deleted = yield newsItem_service_1.NewsItemService.deleteNewsItem(item._id.toString());
        expect(deleted).not.toBeNull();
        const ledgerRow = yield newsDedupLedger_model_1.NewsDedupLedger.findOne({ content_hash: 'deleted-item-hash' });
        expect(ledgerRow).not.toBeNull();
        const result = yield (0, newsIngestion_utils_1.dedupeAgainstStored)([hashedCandidate('deleted-item-hash')]);
        expect(result).toHaveLength(0);
    }));
    it('returns null and writes no tombstone for a non-existent id', () => __awaiter(void 0, void 0, void 0, function* () {
        const insertSpy = jest.spyOn(newsDedupLedger_model_1.NewsDedupLedger, 'insertMany');
        const result = yield newsItem_service_1.NewsItemService.deleteNewsItem('64b000000000000000000000');
        expect(result).toBeNull();
        expect(insertSpy).not.toHaveBeenCalled();
    }));
});
describe('news_dedup_ledger TTL index', () => {
    it('exists with expireAfterSeconds matching NEWS_DEDUP_LEDGER_TTL_DAYS', () => __awaiter(void 0, void 0, void 0, function* () {
        const indexes = yield newsDedupLedger_model_1.NewsDedupLedger.collection.indexes();
        const ttlIndex = indexes.find((idx) => idx.key && idx.key.deleted_at === 1 && typeof idx.expireAfterSeconds === 'number');
        expect(ttlIndex).toBeDefined();
        expect(ttlIndex === null || ttlIndex === void 0 ? void 0 : ttlIndex.expireAfterSeconds).toBe(config_1.default.news_ingestion.dedup_ledger_ttl_days * 86400);
    }));
});
