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
const mockParseURL = jest.fn();
jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: mockParseURL })));
jest.mock('../app/config', () => ({
    __esModule: true,
    default: {
        news_ingestion: {
            rss_feeds: ['https://techcrunch.com/feed/', 'https://medium.com/feed/tag/programming'],
        },
    },
}));
const rss_1 = require("../app/modules/NewsIngestion/adapters/rss");
describe('rss-parser construction', () => {
    it('is constructed with a fetch timeout so a hung feed cannot stall the whole run', () => {
        // `new Parser(...)` runs at module-load time, and the global `clearMocks` config wipes call
        // history before this test body runs — isolateModules re-requires both modules fresh inside
        // this test so the constructor call is attributable here.
        let ParserMock;
        jest.isolateModules(() => {
            ParserMock = require('rss-parser');
            require('../app/modules/NewsIngestion/adapters/rss');
        });
        expect(ParserMock).toHaveBeenCalledWith({ timeout: 10000 });
    });
});
describe('feedLabel', () => {
    it('derives rss:<hostname> from a feed URL, lowercased with www. stripped', () => {
        expect((0, rss_1.feedLabel)('https://www.techcrunch.com/feed/')).toBe('rss:techcrunch.com');
        expect((0, rss_1.feedLabel)('https://medium.com/feed/tag/programming')).toBe('rss:medium.com');
        expect((0, rss_1.feedLabel)('https://WWW.Wired.com/feed/rss')).toBe('rss:wired.com');
    });
    it('falls back to the flat "rss" label for an unparseable feed URL', () => {
        expect((0, rss_1.feedLabel)('not-a-url')).toBe('rss');
    });
});
describe('fetchRss', () => {
    afterEach(() => {
        mockParseURL.mockReset();
    });
    it('labels items with the feed-specific source and tolerates one feed failing', () => __awaiter(void 0, void 0, void 0, function* () {
        mockParseURL.mockImplementation((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === 'https://techcrunch.com/feed/') {
                throw new Error('feed unreachable');
            }
            return {
                items: [{ title: 'Some story', link: 'https://medium.com/@author/some-story', guid: 'guid-1', isoDate: undefined }],
            };
        }));
        const items = yield (0, rss_1.fetchRss)();
        expect(items).toHaveLength(1);
        expect(items[0].source).toBe('rss:medium.com');
    }));
});
