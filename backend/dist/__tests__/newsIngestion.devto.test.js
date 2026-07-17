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
const devto_1 = require("../app/modules/NewsIngestion/adapters/devto");
const jsonResponse = (body) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return body; }) });
const failedResponse = (status) => ({ ok: false, status, json: () => __awaiter(void 0, void 0, void 0, function* () { return []; }) });
const topArticle = (id, title = `Top article ${id}`) => ({
    id,
    title,
    url: `https://dev.to/article-${id}`,
    description: 'desc',
    published_at: new Date().toISOString(),
    public_reactions_count: 10,
    comments_count: 2,
});
describe('fetchDevTo', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it('merges the top and rising responses and dedupes by article id', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('top=1'))
                return jsonResponse([topArticle(1), topArticle(2)]);
            if (url.includes('state=rising'))
                return jsonResponse([topArticle(2, 'Rising duplicate of 2'), topArticle(3)]);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        const items = yield (0, devto_1.fetchDevTo)();
        expect(items.map((i) => i.source_id).sort()).toEqual(['1', '2', '3']);
    }));
    it('returns the rising articles when the top request fails', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('top=1'))
                return failedResponse(500);
            if (url.includes('state=rising'))
                return jsonResponse([topArticle(5)]);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        const items = yield (0, devto_1.fetchDevTo)();
        expect(items).toHaveLength(1);
        expect(items[0].source_id).toBe('5');
    }));
    it('throws when both the top and rising requests fail', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return failedResponse(500); }));
        global.fetch = fetchMock;
        yield expect((0, devto_1.fetchDevTo)()).rejects.toThrow('both top and rising requests failed');
    }));
});
