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
exports.instagramAdapter = void 0;
const logger_1 = require("../../../lib/logger");
const metaOAuth_graph_1 = require("../../MetaOAuth/metaOAuth.graph");
/**
 * Real Instagram Business adapter. Driven by the SAME long-lived Page token as Facebook plus the
 * linked `ig_user_id` (passed as `accountId`). Pulls the last 30 days of media and per-media
 * insights (batched into one HTTP call). IG replaced `impressions` with the `views` family in
 * 2025-26 — same rule as Facebook.
 */
const MEDIA_LIMIT = 25;
/** FEED/CAROUSEL vs REELS get different insight metric sets. Stories are skipped entirely. */
const metricsFor = (mediaProductType) => {
    if ((mediaProductType !== null && mediaProductType !== void 0 ? mediaProductType : '').toUpperCase() === 'REELS')
        return 'views,reach,saved,shares';
    return 'views,reach,saved';
};
const formatFor = (mediaProductType) => {
    switch ((mediaProductType !== null && mediaProductType !== void 0 ? mediaProductType : '').toUpperCase()) {
        case 'REELS':
            return 'reel';
        case 'STORY':
            return 'story';
        default:
            return 'post';
    }
};
const instagramAdapter = (token, accountId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!accountId) {
        throw new Error('Instagram adapter requires an ig_user_id (account_id) — reconnect the page');
    }
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const mediaRes = yield (0, metaOAuth_graph_1.graphGet)(`${accountId}/media`, {
        fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count',
        since,
        limit: MEDIA_LIMIT,
    }, token);
    // Stories vanish after 24h and aren't worth per-media insight calls — skip them.
    const media = ((_a = mediaRes.data) !== null && _a !== void 0 ? _a : []).filter((m) => { var _a; return ((_a = m.media_product_type) !== null && _a !== void 0 ? _a : '').toUpperCase() !== 'STORY'; });
    if (media.length === 0)
        return { status: 'ok', posts: [] };
    // One batched HTTP call for all per-media insights (≤50 sub-requests).
    const relativeUrls = media.map((m) => `${m.id}/insights?metric=${metricsFor(m.media_product_type)}`);
    const insightResults = yield (0, metaOAuth_graph_1.graphBatch)(relativeUrls, token);
    const posts = media.map((m, i) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const insightMap = {};
        const result = insightResults[i];
        if (result && !('error' in result)) {
            for (const insight of (_a = result.data) !== null && _a !== void 0 ? _a : []) {
                insightMap[insight.name] = (_d = (_c = (_b = insight.values) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : 0;
            }
        }
        else if (result && 'error' in result) {
            // Per-item insight failure (e.g. metric drift) — zero it, keep engagement. Never fail the run.
            logger_1.logger.warn({ mediaId: m.id }, '[Analytics] Instagram media insights unavailable — zeroing views/reach');
        }
        return {
            post_id: m.id,
            content_snippet: (_e = m.caption) === null || _e === void 0 ? void 0 : _e.slice(0, 200),
            metrics: {
                views: (_f = insightMap['views']) !== null && _f !== void 0 ? _f : 0,
                reach: (_g = insightMap['reach']) !== null && _g !== void 0 ? _g : 0,
                likes: (_h = m.like_count) !== null && _h !== void 0 ? _h : 0,
                comments: (_j = m.comments_count) !== null && _j !== void 0 ? _j : 0,
                shares: (_k = insightMap['shares']) !== null && _k !== void 0 ? _k : 0,
            },
            published_at: m.timestamp ? new Date(m.timestamp) : undefined,
            format: formatFor(m.media_product_type),
        };
    });
    return { status: 'ok', posts };
});
exports.instagramAdapter = instagramAdapter;
