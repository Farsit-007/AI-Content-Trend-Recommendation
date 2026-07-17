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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seeds realistic platform_posts and platform_analytics rollups for all teams.
 * Idempotent: re-running skips posts that already exist and only embeds new ones.
 *
 * Run: npm run seed:demo-analytics
 */
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../app/config"));
const embeddings_1 = require("../app/lib/embeddings");
const analytics_model_1 = require("../app/modules/Analytics/analytics.model");
const analytics_rollup_1 = require("../app/modules/Analytics/analytics.rollup");
const mock_1 = require("../app/modules/Analytics/adapters/mock");
const platformPost_model_1 = require("../app/modules/PlatformPost/platformPost.model");
const platformCatalog_model_1 = require("../app/modules/PlatformCatalog/platformCatalog.model");
const team_model_1 = require("../app/modules/Team/team.model");
const DEMO_PLATFORMS = ['facebook', 'youtube', 'linkedin'];
function seedDemoAnalytics() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield mongoose_1.default.connect(config_1.default.database_url);
        console.log('[seed:demo-analytics] Connected to MongoDB');
        const teams = yield team_model_1.Team.find().lean();
        if (teams.length === 0) {
            console.log('[seed:demo-analytics] No teams found — run seed:admin first');
            yield mongoose_1.default.disconnect();
            return;
        }
        for (const team of teams) {
            const teamId = team._id.toString();
            console.log(`[seed:demo-analytics] Seeding team: ${team.name} (${teamId})`);
            const enabledRows = yield platformCatalog_model_1.TeamPlatform.find({ team_id: teamId, is_enabled: true }).lean();
            const platforms = enabledRows.length > 0
                ? enabledRows.map((r) => r.platform)
                : DEMO_PLATFORMS;
            for (const platform of platforms) {
                if (platform === 'linkedin') {
                    yield analytics_model_1.AnalyticsRollup.findOneAndUpdate({ team_id: teamId, platform }, {
                        team_id: teamId,
                        platform,
                        status: 'pending_approval',
                        period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                        overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
                        top_posts: [],
                        best_times: [],
                        content_breakdown: [],
                        fetched_at: new Date(),
                    }, { upsert: true });
                    console.log(`  [${platform}] Written pending_approval rollup`);
                    continue;
                }
                const { posts } = yield (0, mock_1.mockAdapter)(teamId, platform);
                const existingIds = new Set((yield platformPost_model_1.PlatformPost.find({ team_id: teamId, platform }).select('post_id').lean()).map((p) => p.post_id));
                let newCount = 0;
                for (const post of posts) {
                    if (existingIds.has(post.post_id))
                        continue;
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
                        }, { upsert: true });
                        newCount++;
                        yield new Promise((r) => setTimeout(r, 120));
                    }
                    catch (err) {
                        console.error(`  [${platform}] embed failed for ${post.post_id}:`, err instanceof Error ? err.message : err);
                    }
                }
                const rollupData = (0, analytics_rollup_1.computeRollup)(teamId, platform, posts);
                yield analytics_model_1.AnalyticsRollup.findOneAndUpdate({ team_id: teamId, platform }, Object.assign(Object.assign({ team_id: teamId, platform, status: 'ok' }, rollupData), { fetched_at: new Date() }), { upsert: true });
                console.log(`  [${platform}] ${newCount} new posts embedded, rollup upserted`);
            }
        }
        yield mongoose_1.default.disconnect();
        console.log('[seed:demo-analytics] Done');
    });
}
seedDemoAnalytics().catch((err) => {
    console.error('[seed:demo-analytics] Fatal error:', err);
    process.exit(1);
});
