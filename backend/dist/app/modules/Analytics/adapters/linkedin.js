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
exports.linkedinAdapter = void 0;
const logger_1 = require("../../../lib/logger");
const linkedinOAuth_api_1 = require("../../LinkedInOAuth/linkedinOAuth.api");
/**
 * Real LinkedIn organization adapter. Driven by the member access token (with admin ACL on the org)
 * plus the numeric organization id (passed as `accountId`). Pulls recent organization posts and
 * their lifetime share statistics, mapping to `IAdapterPost`.
 *
 * Requires the **Community Management API** product on the LinkedIn app. Until that is approved the
 * REST endpoints return HTTP 403 — we surface that as `pending_approval` (never fake numbers, never
 * a crash), matching how the refresh service treats platforms awaiting approval.
 *
 * `token` is the long-lived member token; `accountId` is the organization id (e.g. `2414183`).
 */
const POST_COUNT = 25;
const inferFormat = (content) => {
    var _a, _b, _c, _d;
    if (!content)
        return 'text';
    if (content.article)
        return 'article';
    if (content.multiImage)
        return 'image';
    if ((_b = (_a = content.media) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.includes(':video:'))
        return 'video';
    if ((_d = (_c = content.media) === null || _c === void 0 ? void 0 : _c.id) === null || _d === void 0 ? void 0 : _d.includes(':image:'))
        return 'image';
    if (content.media)
        return 'media';
    return 'text';
};
/** Restli 2.0 list literal, e.g. List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A2). */
const restliList = (urns) => `List(${urns.map((u) => encodeURIComponent(u)).join(',')})`;
/** Fetch lifetime per-post statistics for a batch of share/ugcPost URNs; tolerate a failed batch. */
const fetchStatsFor = (orgId, urns, paramName, token) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const map = new Map();
    if (urns.length === 0)
        return map;
    try {
        const orgUrn = `urn:li:organization:${orgId}`;
        const res = yield (0, linkedinOAuth_api_1.linkedinGet)(`rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&${paramName}=${restliList(urns)}`, token);
        for (const el of (_a = res.elements) !== null && _a !== void 0 ? _a : []) {
            const key = (_b = el.share) !== null && _b !== void 0 ? _b : el.ugcPost;
            if (key)
                map.set(key, el.totalShareStatistics);
        }
    }
    catch (err) {
        // Per-batch statistics failure (metric drift / partial permission) — keep the posts, zero metrics.
        logger_1.logger.warn({ err: err instanceof Error ? err.message : err }, '[Analytics] LinkedIn share statistics unavailable — zeroing engagement for this batch');
    }
    return map;
});
const linkedinAdapter = (token, accountId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!accountId) {
        throw new Error('LinkedIn adapter requires an organization id (account_id) — reconnect the organization');
    }
    try {
        const orgUrn = `urn:li:organization:${accountId}`;
        const postsRes = yield (0, linkedinOAuth_api_1.linkedinGet)(`rest/posts?q=author&author=${encodeURIComponent(orgUrn)}&count=${POST_COUNT}&sortBy=LAST_MODIFIED`, token);
        const posts = ((_a = postsRes.elements) !== null && _a !== void 0 ? _a : []).filter((p) => p.id);
        if (posts.length === 0)
            return { status: 'ok', posts: [] };
        // Statistics are addressed by URN type — split shares from ugcPosts and fetch each group.
        const shareUrns = posts.map((p) => p.id).filter((id) => id.includes(':share:'));
        const ugcUrns = posts.map((p) => p.id).filter((id) => id.includes(':ugcPost:'));
        const [shareStats, ugcStats] = yield Promise.all([
            fetchStatsFor(accountId, shareUrns, 'shares', token),
            fetchStatsFor(accountId, ugcUrns, 'ugcPosts', token),
        ]);
        const mapped = posts.map((p) => {
            var _a, _b, _c, _d, _e, _f, _g;
            const stats = (_a = shareStats.get(p.id)) !== null && _a !== void 0 ? _a : ugcStats.get(p.id);
            return {
                post_id: p.id,
                content_snippet: (_b = p.commentary) === null || _b === void 0 ? void 0 : _b.slice(0, 200),
                metrics: {
                    views: (_c = stats === null || stats === void 0 ? void 0 : stats.impressionCount) !== null && _c !== void 0 ? _c : 0,
                    reach: (_d = stats === null || stats === void 0 ? void 0 : stats.uniqueImpressionsCount) !== null && _d !== void 0 ? _d : 0,
                    likes: (_e = stats === null || stats === void 0 ? void 0 : stats.likeCount) !== null && _e !== void 0 ? _e : 0,
                    comments: (_f = stats === null || stats === void 0 ? void 0 : stats.commentCount) !== null && _f !== void 0 ? _f : 0,
                    shares: (_g = stats === null || stats === void 0 ? void 0 : stats.shareCount) !== null && _g !== void 0 ? _g : 0,
                },
                published_at: p.createdAt ? new Date(p.createdAt) : undefined,
                format: inferFormat(p.content),
            };
        });
        return { status: 'ok', posts: mapped };
    }
    catch (err) {
        // App lacks the Community Management API product (or org access) — report pending approval, not error.
        if (err instanceof linkedinOAuth_api_1.LinkedInApiError && err.isForbidden) {
            logger_1.logger.warn('[Analytics] LinkedIn returned 403 — Community Management API not approved; pending_approval');
            return { status: 'pending_approval', posts: [] };
        }
        throw err;
    }
});
exports.linkedinAdapter = linkedinAdapter;
