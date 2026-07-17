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
const facebook_1 = require("../app/modules/Analytics/adapters/facebook");
const metaOAuth_graph_1 = require("../app/modules/MetaOAuth/metaOAuth.graph");
/**
 * Unit tests for the real Facebook adapter — no DB, no network. `global.fetch` is mocked to
 * return fixture Graph responses so we can assert field mapping and error handling.
 */
const graphResponse = (body, opts = {}) => {
    var _a, _b;
    return ({
        ok: (_a = opts.ok) !== null && _a !== void 0 ? _a : true,
        status: (_b = opts.status) !== null && _b !== void 0 ? _b : 200,
        headers: { get: () => null },
        json: () => __awaiter(void 0, void 0, void 0, function* () { return body; }),
    });
};
const errorEnvelope = (code, message) => graphResponse({ error: { code, message } }, { ok: false, status: 400 });
const setFetch = (impl) => {
    global.fetch = jest.fn((input) => Promise.resolve(impl(String(input))));
};
describe('facebookAdapter', () => {
    afterEach(() => jest.restoreAllMocks());
    it('maps published_posts fields to IAdapterPost metrics (views family + engagement)', () => __awaiter(void 0, void 0, void 0, function* () {
        setFetch(() => graphResponse({
            data: [
                {
                    id: 'post_1',
                    message: 'Hello world from the demo page',
                    created_time: '2026-07-01T10:00:00+0000',
                    attachments: { data: [{ media_type: 'video' }] },
                    reactions: { summary: { total_count: 42 } },
                    comments: { summary: { total_count: 7 } },
                    shares: { count: 5 },
                    insights: {
                        data: [
                            { name: 'post_media_view', values: [{ value: 1000 }] },
                            { name: 'post_media_view_unique', values: [{ value: 800 }] },
                        ],
                    },
                },
            ],
            paging: {},
        }));
        const result = yield (0, facebook_1.facebookAdapter)('PAGE-TOKEN', 'page-123');
        expect(result.status).toBe('ok');
        expect(result.posts).toHaveLength(1);
        expect(result.posts[0]).toMatchObject({
            post_id: 'post_1',
            content_snippet: 'Hello world from the demo page',
            format: 'video',
            metrics: { views: 1000, reach: 800, likes: 42, comments: 7, shares: 5 },
        });
    }));
    it('defaults shares to 0 when absent and format to status with no attachment', () => __awaiter(void 0, void 0, void 0, function* () {
        setFetch(() => graphResponse({
            data: [
                {
                    id: 'post_2',
                    message: 'text only',
                    created_time: '2026-07-02T10:00:00+0000',
                    reactions: { summary: { total_count: 3 } },
                    comments: { summary: { total_count: 1 } },
                    insights: { data: [] },
                },
            ],
            paging: {},
        }));
        const result = yield (0, facebook_1.facebookAdapter)('PAGE-TOKEN', 'page-123');
        expect(result.posts[0].metrics.shares).toBe(0);
        expect(result.posts[0].metrics.views).toBe(0);
        expect(result.posts[0].format).toBe('status');
    }));
    it('tolerates a #100 metric-unsupported error by falling back to engagement-only', () => __awaiter(void 0, void 0, void 0, function* () {
        let call = 0;
        setFetch((url) => {
            call++;
            // First call requests insights and errors with #100; retry omits insights and succeeds.
            if (call === 1) {
                expect(url).toContain('insights.metric');
                return errorEnvelope(100, '(#100) The metric post_media_view is not supported');
            }
            expect(url).not.toContain('insights.metric');
            return graphResponse({
                data: [
                    {
                        id: 'post_3',
                        message: 'engagement only',
                        created_time: '2026-07-03T10:00:00+0000',
                        reactions: { summary: { total_count: 10 } },
                        comments: { summary: { total_count: 2 } },
                        shares: { count: 1 },
                    },
                ],
                paging: {},
            });
        });
        const result = yield (0, facebook_1.facebookAdapter)('PAGE-TOKEN', 'page-123');
        expect(call).toBe(2);
        expect(result.posts).toHaveLength(1);
        expect(result.posts[0].metrics).toMatchObject({ views: 0, reach: 0, likes: 10, comments: 2, shares: 1 });
    }));
    it('propagates a 190 (token dead) error as GraphApiError for the refresh taxonomy', () => __awaiter(void 0, void 0, void 0, function* () {
        setFetch(() => errorEnvelope(190, 'Error validating access token: Session has expired'));
        yield expect((0, facebook_1.facebookAdapter)('PAGE-TOKEN', 'page-123')).rejects.toBeInstanceOf(metaOAuth_graph_1.GraphApiError);
        yield expect((0, facebook_1.facebookAdapter)('PAGE-TOKEN', 'page-123')).rejects.toMatchObject({ code: 190 });
    }));
});
