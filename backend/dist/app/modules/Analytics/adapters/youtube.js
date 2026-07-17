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
exports.youtubeAdapter = void 0;
const youtubeAdapter = (apiKey) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const searchRes = yield fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&forMine=true&publishedAfter=${publishedAfter}&maxResults=50&key=${apiKey}`);
    if (!searchRes.ok) {
        throw new Error(`YouTube API error: ${searchRes.status} ${searchRes.statusText}`);
    }
    const searchData = (yield searchRes.json());
    const videoIds = ((_a = searchData.items) !== null && _a !== void 0 ? _a : []).map((v) => v.id.videoId).join(',');
    if (!videoIds)
        return { status: 'ok', posts: [] };
    const statsRes = yield fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${apiKey}`);
    if (!statsRes.ok) {
        throw new Error(`YouTube stats API error: ${statsRes.status} ${statsRes.statusText}`);
    }
    const statsData = (yield statsRes.json());
    const statsById = new Map(statsData.items.map((v) => [v.id, v.statistics]));
    const posts = ((_b = searchData.items) !== null && _b !== void 0 ? _b : []).map((v) => {
        var _a, _b, _c, _d, _e;
        const stats = (_a = statsById.get(v.id.videoId)) !== null && _a !== void 0 ? _a : {};
        const views = Number((_b = stats.viewCount) !== null && _b !== void 0 ? _b : 0);
        const likes = Number((_c = stats.likeCount) !== null && _c !== void 0 ? _c : 0);
        const comments = Number((_d = stats.commentCount) !== null && _d !== void 0 ? _d : 0);
        return {
            post_id: v.id.videoId,
            content_snippet: (_e = v.snippet.title) === null || _e === void 0 ? void 0 : _e.slice(0, 200),
            metrics: { reach: views, likes, comments, shares: 0, views },
            published_at: v.snippet.publishedAt ? new Date(v.snippet.publishedAt) : undefined,
            format: 'video',
        };
    });
    return { status: 'ok', posts };
});
exports.youtubeAdapter = youtubeAdapter;
