"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const analytics_route_1 = require("../modules/Analytics/analytics.route");
const generatedContent_route_1 = require("../modules/GeneratedContent/generatedContent.route");
const brandVoiceExample_route_1 = require("../modules/BrandVoiceExample/brandVoiceExample.route");
const chat_route_1 = require("../modules/Chat/chat.route");
const contentGeneration_route_1 = require("../modules/ContentGeneration/contentGeneration.route");
const metaOAuth_route_1 = require("../modules/MetaOAuth/metaOAuth.route");
const linkedinOAuth_route_1 = require("../modules/LinkedInOAuth/linkedinOAuth.route");
const newsItem_route_1 = require("../modules/NewsItem/newsItem.route");
const platformPost_route_1 = require("../modules/PlatformPost/platformPost.route");
const platformCatalog_route_1 = require("../modules/PlatformCatalog/platformCatalog.route");
const report_route_1 = require("../modules/Report/report.route");
const team_route_1 = require("../modules/Team/team.route");
const user_route_1 = require("../modules/User/user.route");
const openapi_1 = require("../docs/openapi");
const router = (0, express_1.Router)();
// API documentation: raw OpenAPI 3.1 spec and interactive Swagger UI.
router.get('/openapi.json', (_req, res) => {
    res.json(openapi_1.openApiDocument);
});
router.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.openApiDocument));
const moduleRoutes = [
    { path: '/auth', route: user_route_1.AuthRoutes },
    { path: '/users', route: user_route_1.UserRoutes },
    { path: '/teams', route: team_route_1.TeamRoutes },
    { path: '/platforms', route: platformCatalog_route_1.PlatformCatalogRoutes },
    { path: '/news-items', route: newsItem_route_1.NewsItemRoutes },
    { path: '/platform-posts', route: platformPost_route_1.PlatformPostRoutes },
    { path: '/brand-voice-examples', route: brandVoiceExample_route_1.BrandVoiceExampleRoutes },
    { path: '/content', route: contentGeneration_route_1.ContentGenerationRoutes },
    { path: '/chat', route: chat_route_1.ChatRoutes },
    { path: '/analytics', route: analytics_route_1.AnalyticsRoutes },
    { path: '/oauth/facebook', route: metaOAuth_route_1.MetaOAuthRoutes },
    { path: '/oauth/linkedin', route: linkedinOAuth_route_1.LinkedInOAuthRoutes },
    { path: '/reports', route: report_route_1.ReportRoutes },
    { path: '/generated-content', route: generatedContent_route_1.GeneratedContentRoutes },
];
moduleRoutes.forEach((route) => {
    router.use(route.path, route.route);
});
exports.default = router;
