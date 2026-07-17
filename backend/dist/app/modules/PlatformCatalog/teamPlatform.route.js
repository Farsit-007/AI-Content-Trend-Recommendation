"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamPlatformRoutes = void 0;
const express_1 = require("express");
const platformCatalog_controller_1 = require("./platformCatalog.controller");
// Mounted at /teams/:teamId/platforms by team.route.ts — mergeParams is required to see :teamId.
// Auth + team-access are already enforced by the parent router, not repeated here.
const router = (0, express_1.Router)({ mergeParams: true });
router.get('/', platformCatalog_controller_1.PlatformCatalogController.listTeamPlatforms);
router.post('/:platform/enable', platformCatalog_controller_1.PlatformCatalogController.enableForTeam);
router.post('/:platform/disable', platformCatalog_controller_1.PlatformCatalogController.disableForTeam);
exports.TeamPlatformRoutes = router;
