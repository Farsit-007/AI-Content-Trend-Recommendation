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
const lobsters_1 = require("../app/modules/NewsIngestion/adapters/lobsters");
const jsonResponse = (body) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return body; }) });
const failedResponse = (status) => ({ ok: false, status, json: () => __awaiter(void 0, void 0, void 0, function* () { return []; }) });
const story = (overrides = {}) => (Object.assign({ short_id: 'abc123', title: 'A great story', url: 'https://example.com/article', comments_url: 'https://lobste.rs/s/abc123/a_great_story', created_at: '2026-07-15T12:00:00.000Z', score: 10, comment_count: 3, description: undefined, tags: [] }, overrides));
describe('fetchLobsters', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it('maps engagement signals onto raw_points and raw_comments', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return jsonResponse([story({ score: 42, comment_count: 7 })]); }));
        global.fetch = fetchMock;
        const items = yield (0, lobsters_1.fetchLobsters)();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'lobsters',
            source_id: 'abc123',
            raw_points: 42,
            raw_comments: 7,
            raw_stars_delta: 0,
            published_at: new Date('2026-07-15T12:00:00.000Z'),
        });
    }));
    it('falls back to comments_url when the story has no external url', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return jsonResponse([story({ url: '' })]); }));
        global.fetch = fetchMock;
        const items = yield (0, lobsters_1.fetchLobsters)();
        expect(items[0].url).toBe('https://lobste.rs/s/abc123/a_great_story');
    }));
    it('strips HTML and decodes entities in the description for the snippet', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return jsonResponse([story({ description: '<p>Tom &amp; Jerry&#39;s <b>excellent</b> adventure</p>' })]); }));
        global.fetch = fetchMock;
        const items = yield (0, lobsters_1.fetchLobsters)();
        expect(items[0].snippet).toBe("Tom & Jerry's excellent adventure");
    }));
    it('falls back to tags as the snippet when there is no description', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return jsonResponse([story({ description: undefined, tags: ['ai', 'web'] })]); }));
        global.fetch = fetchMock;
        const items = yield (0, lobsters_1.fetchLobsters)();
        expect(items[0].snippet).toBe('ai web');
    }));
    it('stores the full uncapped description as content while snippet stays capped at 500 characters', () => __awaiter(void 0, void 0, void 0, function* () {
        const longDescription = `<p>${'y'.repeat(600)}</p>`;
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return jsonResponse([story({ description: longDescription })]); }));
        global.fetch = fetchMock;
        const items = yield (0, lobsters_1.fetchLobsters)();
        expect(items[0].snippet).toHaveLength(500);
        expect(items[0].content).toHaveLength(600);
    }));
    it('leaves content undefined when there is no description', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return jsonResponse([story({ description: undefined, tags: ['ai'] })]); }));
        global.fetch = fetchMock;
        const items = yield (0, lobsters_1.fetchLobsters)();
        expect(items[0].content).toBeUndefined();
    }));
    it('throws when the hottest endpoint returns a non-OK status', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return failedResponse(500); }));
        global.fetch = fetchMock;
        yield expect((0, lobsters_1.fetchLobsters)()).rejects.toThrow('Lobsters request failed: 500');
    }));
});
