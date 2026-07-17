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
exports.getTeamAnalytics = exports.runAnalyticsRefresh = void 0;
const logger_1 = require("../../lib/logger");
const embeddings_1 = require("../../lib/embeddings");
const platformCredentials_1 = require("../../lib/platformCredentials");
const redis_1 = require("../../lib/redis");
const metaOAuth_graph_1 = require("../MetaOAuth/metaOAuth.graph");
const platformCredential_model_1 = require("../PlatformCredential/platformCredential.model");
const team_model_1 = require("../Team/team.model");
const platformCatalog_model_1 = require("../PlatformCatalog/platformCatalog.model");
const platformPost_model_1 = require("../PlatformPost/platformPost.model");
const adapters_1 = require("./adapters");
const analytics_model_1 = require("./analytics.model");
const analytics_rollup_1 = require("./analytics.rollup");
const EMPTY_OVERVIEW = { reach: 0, engagements: 0, views: 0, engagement_rate: 0 };
const thirtyDayPeriod = () => ({ start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() });
/** Signals the whole refresh run must stop (app-level rate limit) rather than skip one platform. */
class RefreshAbortError extends Error {
}
/** Runs the adapter, retrying ONCE after 5s for transient Meta errors (codes 1, 2). */
const runAdapterWithRetry = (adapter, token, teamId, platform, accountId) => adapter(token, teamId, platform, accountId).catch((err) => __awaiter(void 0, void 0, void 0, function* () {
    if (err instanceof metaOAuth_graph_1.GraphApiError && (err.code === 1 || err.code === 2)) {
        yield new Promise((r) => setTimeout(r, 5000));
        return adapter(token, teamId, platform, accountId);
    }
    throw err;
}));
const embedNewPosts = (teamId, platform, posts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const existingIds = new Set((yield platformPost_model_1.PlatformPost.find({ team_id: teamId, platform }).select('post_id')).map((p) => p.post_id));
    const newPosts = posts.filter((p) => !existingIds.has(p.post_id));
    if (newPosts.length === 0)
        return;
    for (const post of newPosts) {
        try {
            const text = (_a = post.content_snippet) !== null && _a !== void 0 ? _a : post.post_id;
            const embedding = yield (0, embeddings_1.embed)(text);
            yield platformPost_model_1.PlatformPost.findOneAndUpdate({ team_id: teamId, platform, post_id: post.post_id }, {
                team_id: teamId,
                platform,
                post_id: post.post_id,
                content_snippet: post.content_snippet,
                embedding,
                metrics: post.metrics,
                published_at: post.published_at,
                fetched_at: new Date(),
            }, { upsert: true, new: true });
            yield new Promise((r) => setTimeout(r, 100));
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[Analytics] Failed to embed post ${post.post_id}`);
        }
    }
});
const upsertRollup = (data) => __awaiter(void 0, void 0, void 0, function* () {
    yield analytics_model_1.AnalyticsRollup.findOneAndUpdate({ team_id: data.team_id, platform: data.platform }, Object.assign(Object.assign({}, data), { fetched_at: new Date() }), { upsert: true, new: true });
});
const runAnalyticsRefresh = (filter) => __awaiter(void 0, void 0, void 0, function* () {
    const teamQuery = (filter === null || filter === void 0 ? void 0 : filter.teamId) ? { _id: filter.teamId } : {};
    const teams = yield team_model_1.Team.find(teamQuery).lean();
    let teamsProcessed = 0;
    let platformsProcessed = 0;
    try {
        for (const team of teams) {
            const teamId = team._id.toString();
            const enabledPlatforms = yield platformCatalog_model_1.TeamPlatform.find({ team_id: teamId, is_enabled: true }).lean();
            if (enabledPlatforms.length === 0)
                continue;
            teamsProcessed++;
            for (const tp of enabledPlatforms) {
                const platform = tp.platform;
                const writeStub = (status) => upsertRollup({
                    team_id: teamId,
                    platform,
                    status,
                    period: thirtyDayPeriod(),
                    overview: Object.assign({}, EMPTY_OVERVIEW),
                    top_posts: [],
                    best_times: [],
                    content_breakdown: [],
                    is_mock: false,
                    fetched_at: new Date(),
                });
                try {
                    const token = yield (0, platformCredentials_1.getPlatformToken)(platform, teamId);
                    if (token === null) {
                        yield writeStub('not_connected');
                        platformsProcessed++;
                        continue;
                    }
                    const credential = yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform }).lean();
                    const adapter = (0, adapters_1.getAdapter)(platform);
                    const result = yield runAdapterWithRetry(adapter, token, teamId, platform, credential === null || credential === void 0 ? void 0 : credential.account_id);
                    if (result.status === 'pending_approval') {
                        yield writeStub('pending_approval');
                        platformsProcessed++;
                        continue;
                    }
                    yield embedNewPosts(teamId, platform, result.posts);
                    const rollupData = (0, analytics_rollup_1.computeRollup)(teamId, platform, result.posts);
                    yield upsertRollup(Object.assign(Object.assign({ team_id: teamId, platform, status: 'ok' }, rollupData), { is_mock: (0, adapters_1.isMockAdapter)(), fetched_at: new Date() }));
                    platformsProcessed++;
                }
                catch (err) {
                    // Map Meta's Graph error taxonomy to a rollup outcome. Non-Graph errors fall through to 'error'.
                    if (err instanceof metaOAuth_graph_1.GraphApiError) {
                        // Token expired/revoked/invalid — mark not_connected and flag the credential for the UI. No retry.
                        if (err.code === 190) {
                            yield platformCredential_model_1.PlatformCredential.updateOne({ team_id: teamId, platform }, { token_expires_at: new Date() });
                            yield writeStub('not_connected');
                            platformsProcessed++;
                            logger_1.logger.warn(`[Analytics] Token dead (190) for team ${teamId} platform ${platform} — marked not_connected`);
                            continue;
                        }
                        // Permission missing/revoked.
                        if (err.code === 10 || (err.code >= 200 && err.code <= 299)) {
                            yield writeStub('not_connected');
                            platformsProcessed++;
                            logger_1.logger.warn(`[Analytics] Permission error (${err.code}) for team ${teamId} platform ${platform}`);
                            continue;
                        }
                        // App-level rate limit — abort the ENTIRE run and let the next cron retry.
                        if (err.code === 4) {
                            logger_1.logger.error(`[Analytics] App-level rate limit (4) — aborting refresh run`);
                            throw new RefreshAbortError();
                        }
                        // User/Page-level rate limit — skip just this team+platform this run.
                        if (err.code === 17 || err.code === 32) {
                            yield writeStub('error');
                            platformsProcessed++;
                            logger_1.logger.warn(`[Analytics] Rate limit (${err.code}) — skipping team ${teamId} platform ${platform}`);
                            continue;
                        }
                    }
                    logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[Analytics] Failed for team ${teamId} platform ${platform}`);
                    yield writeStub('error');
                    platformsProcessed++;
                }
            }
            yield redis_1.redis.del(`report:${teamId}`);
        }
    }
    catch (err) {
        // App-level rate limit aborts the whole run; the next cron picks up where we stopped.
        if (!(err instanceof RefreshAbortError))
            throw err;
    }
    return { success: true, teamsProcessed, platformsProcessed };
});
exports.runAnalyticsRefresh = runAnalyticsRefresh;
const getTeamAnalytics = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    return analytics_model_1.AnalyticsRollup.find({ team_id: teamId }).lean();
});
exports.getTeamAnalytics = getTeamAnalytics;
