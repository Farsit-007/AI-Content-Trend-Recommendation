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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsItemService = void 0;
const config_1 = __importDefault(require("../../config"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const embeddings_1 = require("../../lib/embeddings");
const redis_1 = require("../../lib/redis");
const newsDedupLedger_service_1 = require("../NewsDedupLedger/newsDedupLedger.service");
const newsItemCategoryOverride_service_1 = require("../NewsItemCategoryOverride/newsItemCategoryOverride.service");
const platformPost_model_1 = require("../PlatformPost/platformPost.model");
const report_opportunities_1 = require("../Report/report.opportunities");
const newsItem_model_1 = require("./newsItem.model");
const newsItem_utils_1 = require("./newsItem.utils");
const HIGH_OPPORTUNITY_THRESHOLD = 7.5;
const loadTeamEmbeddings = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const cacheKey = `team_embeddings:${teamId}`;
    const cached = yield redis_1.redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }
    const posts = yield platformPost_model_1.PlatformPost.find({ team_id: teamId }).select('embedding metrics').lean();
    const result = posts.map((p) => ({
        embedding: p.embedding,
        engagement: p.metrics.likes + p.metrics.comments + p.metrics.shares,
    }));
    yield redis_1.redis.setex(cacheKey, config_1.default.analytics.team_embeddings_cache_ttl, JSON.stringify(result));
    return result;
});
/** Splices in the requesting user's team override (if any) without mutating the stored document. */
const withOverride = (item, override) => {
    var _a, _b;
    const plain = item.toObject();
    if (!override) {
        return Object.assign(Object.assign({}, plain), { is_overridden: false });
    }
    return Object.assign(Object.assign({}, plain), { category: (_a = override.category) !== null && _a !== void 0 ? _a : plain.category, opportunity_score: (_b = override.opportunity_score) !== null && _b !== void 0 ? _b : plain.opportunity_score, is_overridden: true });
};
const createNewsItem = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const embedding = (_a = payload.embedding) !== null && _a !== void 0 ? _a : (yield (0, embeddings_1.embed)(`${(_b = payload.title) !== null && _b !== void 0 ? _b : ''} ${(_c = payload.snippet) !== null && _c !== void 0 ? _c : ''}`.trim()));
    const result = yield newsItem_model_1.NewsItem.create(Object.assign(Object.assign({}, payload), { embedding }));
    return result;
});
const getAllNewsItems = (query, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = query, { team_id: queryTeamId } = _a, remainingQuery = __rest(_a, ["team_id"]);
    // QueryBuilder.sort()'s own default (`-createdAt`) references a field that doesn't exist on
    // this schema, so it never does anything — inject the real default here, before QueryBuilder
    // sees the query, so an explicit `?sort=` still wins unchanged.
    if (!remainingQuery.sort) {
        remainingQuery.sort = '-current_trend_score -created_at';
    }
    // Base filter, not folded into `remainingQuery`: an explicit `?lifecycle=` still needs to flow
    // through QueryBuilder.filter() untouched (e.g. the `?lifecycle=archived` admin escape hatch),
    // so the exclusion is only added here when the caller didn't ask for a specific lifecycle.
    const baseFilter = remainingQuery.lifecycle ? {} : { lifecycle: { $ne: 'archived' } };
    const newsItemQuery = new QueryBuilder_1.default(newsItem_model_1.NewsItem.find(baseFilter), remainingQuery)
        .search(newsItem_utils_1.newsItemSearchableFields)
        .filter()
        .sort()
        .paginate();
    const result = yield newsItemQuery.modelQuery;
    const meta = yield newsItemQuery.countTotal();
    let teamEmbeddings = [];
    const teamId = queryTeamId !== null && queryTeamId !== void 0 ? queryTeamId : (requestingUser === null || requestingUser === void 0 ? void 0 : requestingUser.team_ids[0]);
    if (teamId) {
        try {
            teamEmbeddings = yield loadTeamEmbeddings(teamId);
        }
        catch (_b) {
            // non-fatal — fall back to threshold
        }
    }
    const annotate = (plain) => {
        var _a, _b;
        if (!teamId)
            return plain;
        const high_opportunity = teamEmbeddings.length > 0
            ? (0, report_opportunities_1.computeAudienceMatch)((_a = plain.embedding) !== null && _a !== void 0 ? _a : [], teamEmbeddings) > 0.6
            : ((_b = plain.opportunity_score) !== null && _b !== void 0 ? _b : 0) >= HIGH_OPPORTUNITY_THRESHOLD;
        return Object.assign(Object.assign({}, plain), { high_opportunity });
    };
    if (!requestingUser || requestingUser.team_ids.length === 0) {
        return { meta, result: result.map((item) => annotate(withOverride(item))) };
    }
    const overridesByItem = yield newsItemCategoryOverride_service_1.NewsItemCategoryOverrideService.fetchOverridesForItems(result.map((item) => item._id.toString()), requestingUser.team_ids);
    return {
        meta,
        result: result.map((item) => annotate(withOverride(item, overridesByItem.get(item._id.toString())))),
    };
});
const getSingleNewsItem = (id, requestingUser) => __awaiter(void 0, void 0, void 0, function* () {
    // Intentionally unfiltered by lifecycle: archived is not the same as hidden-by-id — old
    // generated content links to archived items and must keep resolving until hard delete.
    const result = yield newsItem_model_1.NewsItem.findById(id);
    if (!result)
        return null;
    if (!requestingUser || requestingUser.team_ids.length === 0) {
        return withOverride(result);
    }
    const overridesByItem = yield newsItemCategoryOverride_service_1.NewsItemCategoryOverrideService.fetchOverridesForItems([result._id.toString()], requestingUser.team_ids);
    return withOverride(result, overridesByItem.get(result._id.toString()));
});
const updateNewsItem = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    // `current_trend_score` is system-maintained (ingest + refresh job only); the validation
    // middleware doesn't strip unvalidated fields from req.body, so guard it here explicitly.
    const { current_trend_score: _currentTrendScore } = payload, safePayload = __rest(payload, ["current_trend_score"]);
    // Restoring an item must not leave stale archive metadata behind.
    const update = safePayload.lifecycle === 'active' ? Object.assign(Object.assign({}, safePayload), { $unset: { archived_at: 1, archive_reason: 1 } }) : safePayload;
    const result = yield newsItem_model_1.NewsItem.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
    });
    return result;
});
const deleteNewsItem = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const item = yield newsItem_model_1.NewsItem.findById(id, { content_hash: 1, title: 1, source: 1 });
    if (!item)
        return null;
    // Tombstone-before-delete is the invariant (design.md decision 1 of dedup-tombstone-ledger):
    // a crash between these two steps leaves a harmless extra tombstone, never a resurrection window.
    yield (0, newsDedupLedger_service_1.recordTombstones)([{ content_hash: item.content_hash, title: item.title, source: item.source }]);
    const result = yield newsItem_model_1.NewsItem.findByIdAndDelete(id);
    return result;
});
exports.NewsItemService = {
    createNewsItem,
    getAllNewsItems,
    getSingleNewsItem,
    updateNewsItem,
    deleteNewsItem,
};
