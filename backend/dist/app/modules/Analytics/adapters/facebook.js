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
exports.facebookAdapter = void 0;
const logger_1 = require("../../../lib/logger");
const metaOAuth_graph_1 = require("../../MetaOAuth/metaOAuth.graph");
/**
 * Real Facebook Page adapter. Pulls the last 30 days of published posts with real engagement
 * summaries and the post-June-2026 "views family" insight metrics (`post_media_view`,
 * `post_media_view_unique`) — the old impression-family metrics were removed by Meta on
 * 2026-06-15 and would 400 / return nulls.
 *
 * `token` is the long-lived Page token; `accountId` is the FB Page id.
 */
const MAX_PAGES = 4; // ≤100 posts over the 30-day window keeps call volume tiny
const PAGE_LIMIT = 25;
const INSIGHT_METRICS = 'post_media_view,post_media_view_unique';
const baseFields = [
    'id',
    'message',
    'created_time',
    'attachments{media_type}',
    'reactions.summary(true).limit(0)',
    'comments.summary(true).limit(0)',
    'shares',
].join(',');
const fieldsWithInsights = `${baseFields},insights.metric(${INSIGHT_METRICS})`;
const FORMAT_MAP = {
    photo: 'photo',
    video: 'video',
    video_inline: 'video',
    link: 'link',
    status: 'status',
    album: 'photo',
    share: 'link',
};
const mapPost = (p) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    const insightMap = {};
    for (const insight of (_b = (_a = p.insights) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : []) {
        insightMap[insight.name] = (_e = (_d = (_c = insight.values) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.value) !== null && _e !== void 0 ? _e : 0;
    }
    const rawMediaType = (_j = (_h = (_g = (_f = p.attachments) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.media_type) === null || _j === void 0 ? void 0 : _j.toLowerCase();
    const format = rawMediaType ? (_k = FORMAT_MAP[rawMediaType]) !== null && _k !== void 0 ? _k : rawMediaType : 'status';
    return {
        post_id: p.id,
        content_snippet: (_l = p.message) === null || _l === void 0 ? void 0 : _l.slice(0, 200),
        metrics: {
            views: (_m = insightMap['post_media_view']) !== null && _m !== void 0 ? _m : 0,
            reach: (_o = insightMap['post_media_view_unique']) !== null && _o !== void 0 ? _o : 0,
            likes: (_r = (_q = (_p = p.reactions) === null || _p === void 0 ? void 0 : _p.summary) === null || _q === void 0 ? void 0 : _q.total_count) !== null && _r !== void 0 ? _r : 0,
            comments: (_u = (_t = (_s = p.comments) === null || _s === void 0 ? void 0 : _s.summary) === null || _t === void 0 ? void 0 : _t.total_count) !== null && _u !== void 0 ? _u : 0,
            shares: (_w = (_v = p.shares) === null || _v === void 0 ? void 0 : _v.count) !== null && _w !== void 0 ? _w : 0,
        },
        published_at: p.created_time ? new Date(p.created_time) : undefined,
        format,
    };
};
/** True when a Graph error means "this insight metric isn't available on this object" (drift). */
const isMetricUnsupported = (err) => err instanceof metaOAuth_graph_1.GraphApiError && (err.code === 100 || /metric/i.test(err.message));
const facebookAdapter = (token, accountId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (!accountId) {
        throw new Error('Facebook adapter requires a page id (account_id) — reconnect the page');
    }
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const posts = [];
    let after;
    // When insights drift (#100), fall back to engagement-only for the rest of the run.
    let includeInsights = true;
    for (let page = 0; page < MAX_PAGES; page++) {
        let res;
        try {
            res = yield (0, metaOAuth_graph_1.graphGet)(`${accountId}/published_posts`, {
                fields: includeInsights ? fieldsWithInsights : baseFields,
                since,
                limit: PAGE_LIMIT,
                after,
            }, token);
        }
        catch (err) {
            // Only tolerate metric drift — token death (190) / rate limits must propagate to the taxonomy.
            if (includeInsights && isMetricUnsupported(err)) {
                logger_1.logger.warn('[Analytics] Facebook insight metrics unsupported — falling back to engagement-only');
                includeInsights = false;
                page--; // retry this same page without insights
                continue;
            }
            throw err;
        }
        for (const p of (_a = res.data) !== null && _a !== void 0 ? _a : [])
            posts.push(mapPost(p));
        after = (_c = (_b = res.paging) === null || _b === void 0 ? void 0 : _b.cursors) === null || _c === void 0 ? void 0 : _c.after;
        if (!after || !((_d = res.paging) === null || _d === void 0 ? void 0 : _d.next))
            break;
        // Reuse the project's inter-call pacing between Graph calls.
        yield new Promise((r) => setTimeout(r, 100));
    }
    return { status: 'ok', posts };
});
exports.facebookAdapter = facebookAdapter;
