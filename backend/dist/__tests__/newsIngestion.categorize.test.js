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
const newsIngestion_categorize_1 = require("../app/modules/NewsIngestion/newsIngestion.categorize");
const openrouterMock_1 = require("./support/openrouterMock");
const baseItem = (overrides = {}) => (Object.assign({ source: 'hackernews', source_id: '1', title: 'A great story', url: 'https://example.test/a', content_hash: 'hash-1', embedding: Array(1536).fill(0.01), trend_score: 5, relevance_score: 6, raw_points: 10, raw_comments: 2, raw_stars_delta: 0 }, overrides));
const cannedCategorization = (items) => JSON.stringify(items.map((_, id) => ({ id, category: 'AI', impact_note: 'note', confidence: 0.9, audience_fit: 0.5 })));
describe('categorizeBatch prompt content', () => {
    it('includes a content lead when the item has content', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = baseItem({ content: 'x'.repeat(600), snippet: 'short snippet' });
        (0, openrouterMock_1.mockChatCompletion)(cannedCategorization([item]));
        yield (0, newsIngestion_categorize_1.categorizeBatch)([item]);
        const prompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[1].content;
        expect(prompt).toContain(` — content: ${item.content.slice(0, 500)}`);
    }));
    it('renders the pre-change line unchanged when there is no content', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = baseItem({ snippet: 'short snippet' });
        (0, openrouterMock_1.mockChatCompletion)(cannedCategorization([item]));
        yield (0, newsIngestion_categorize_1.categorizeBatch)([item]);
        const prompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[1].content;
        expect(prompt).toBe(`0. "${item.title}" — short snippet (relevance_score=6, trend_score=5)`);
    }));
});
