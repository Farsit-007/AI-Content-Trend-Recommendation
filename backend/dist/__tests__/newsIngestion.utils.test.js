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
jest.mock('../app/lib/openrouterClient');
jest.mock('../app/config', () => ({
    __esModule: true,
    default: { embedding_model: 'test-embedding-model' },
}));
const openrouterClient_1 = require("../app/lib/openrouterClient");
const newsIngestion_utils_1 = require("../app/modules/NewsIngestion/newsIngestion.utils");
const mocked = openrouterClient_1.openrouter;
const hashedItem = (n) => ({
    source: 'test',
    source_id: String(n),
    content_hash: `hash-${n}`,
    title: `Item ${n}`,
    url: `https://example.com/${n}`,
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: 0,
});
describe('embedItems', () => {
    afterEach(() => jest.clearAllMocks());
    it('resolves to [] without any API call for an empty list', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield (0, newsIngestion_utils_1.embedItems)([]);
        expect(result).toEqual([]);
        expect(mocked.embeddings.create).not.toHaveBeenCalled();
    }));
    it('splits more than EMBED_BATCH_SIZE items into multiple batched calls and preserves item order', () => __awaiter(void 0, void 0, void 0, function* () {
        const items = Array.from({ length: 45 }, (_, i) => hashedItem(i));
        mocked.embeddings.create.mockImplementation((req) => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                data: req.input.map(() => ({ embedding: [1, 2, 3] })),
            });
        }));
        const embedded = yield (0, newsIngestion_utils_1.embedItems)(items);
        // 45 items at EMBED_BATCH_SIZE=20 -> 3 batched calls (20 + 20 + 5), not one call per item.
        expect(mocked.embeddings.create).toHaveBeenCalledTimes(3);
        expect(embedded).toHaveLength(45);
        expect(embedded.map((i) => i.source_id)).toEqual(items.map((i) => i.source_id));
        expect(embedded.every((i) => i.embedding.length === 3)).toBe(true);
    }));
    it('propagates an embedding failure as a rejection', () => __awaiter(void 0, void 0, void 0, function* () {
        mocked.embeddings.create.mockResolvedValue({});
        yield expect((0, newsIngestion_utils_1.embedItems)([hashedItem(1)])).rejects.toThrow('OpenRouter embedding response did not contain the expected vectors');
    }));
});
