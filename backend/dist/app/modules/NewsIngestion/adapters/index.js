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
exports.runAllAdapters = void 0;
const logger_1 = require("../../../lib/logger");
const devto_1 = require("./devto");
const githubTrending_1 = require("./githubTrending");
const hackerNews_1 = require("./hackerNews");
const lobsters_1 = require("./lobsters");
const gnews_1 = require("./gnews");
const mastodon_1 = require("./mastodon");
const producthunt_1 = require("./producthunt");
const reddit_1 = require("./reddit");
const rss_1 = require("./rss");
const stackoverflow_1 = require("./stackoverflow");
const ADAPTERS = [
    { source: 'hackernews', fetch: hackerNews_1.fetchHackerNews },
    { source: 'devto', fetch: devto_1.fetchDevTo },
    { source: 'github_trending', fetch: githubTrending_1.fetchGithubTrending },
    { source: 'reddit', fetch: reddit_1.fetchReddit },
    { source: 'rss', fetch: rss_1.fetchRss },
    { source: 'lobsters', fetch: lobsters_1.fetchLobsters },
    { source: 'mastodon', fetch: mastodon_1.fetchMastodon },
    { source: 'producthunt', fetch: producthunt_1.fetchProductHunt },
    { source: 'stackoverflow', fetch: stackoverflow_1.fetchStackOverflow },
    { source: 'gnews', fetch: gnews_1.fetchGNews },
];
const runAllAdapters = () => __awaiter(void 0, void 0, void 0, function* () {
    return Promise.all(ADAPTERS.map((_a) => __awaiter(void 0, [_a], void 0, function* ({ source, fetch }) {
        try {
            const items = yield fetch();
            return { source, items };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.error({ err: message }, `[NewsIngestion] Adapter "${source}" failed`);
            return { source, items: [], error: message };
        }
    })));
});
exports.runAllAdapters = runAllAdapters;
