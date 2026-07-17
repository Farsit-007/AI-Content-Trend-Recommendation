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
exports.fetchLobsters = void 0;
const htmlText_1 = require("./htmlText");
const HOTTEST_URL = 'https://lobste.rs/hottest.json';
const SNIPPET_MAX_LENGTH = 500;
/** Prefers the real description; falls back to the story's tags as cheap extra relevance-filter signal. */
const buildSnippet = (story) => {
    if (story.description) {
        const text = (0, htmlText_1.decodeEntities)((0, htmlText_1.stripHtml)(story.description)).slice(0, SNIPPET_MAX_LENGTH);
        return text || undefined;
    }
    if (story.tags && story.tags.length > 0) {
        return story.tags.join(' ');
    }
    return undefined;
};
const fetchLobsters = () => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield fetch(HOTTEST_URL, {
        headers: { 'User-Agent': 'GrowthStudioBot/1.0' },
    });
    if (!res.ok)
        throw new Error(`Lobsters request failed: ${res.status}`);
    const stories = (yield res.json());
    return stories.map((story) => ({
        source: 'lobsters',
        source_id: story.short_id,
        title: story.title,
        url: story.url || story.comments_url,
        snippet: buildSnippet(story),
        published_at: new Date(story.created_at),
        raw_points: story.score,
        raw_comments: story.comment_count,
        raw_stars_delta: 0,
    }));
});
exports.fetchLobsters = fetchLobsters;
