"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformCatalogRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const validation_1 = require("../../middleware/validation");
const platformCatalog_controller_1 = require("./platformCatalog.controller");
const platformCatalog_validation_1 = require("./platformCatalog.validation");
// Mounted at /platforms — the super_admin-curated list of platforms that exist in the system.
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.post('/', auth_1.requireSuperAdmin, (0, validation_1.validation)(platformCatalog_validation_1.PlatformCatalogValidation.createPlatformValidation), platformCatalog_controller_1.PlatformCatalogController.createPlatform);
router.get('/', platformCatalog_controller_1.PlatformCatalogController.listPlatforms);
router.patch('/:name/enable', auth_1.requireSuperAdmin, platformCatalog_controller_1.PlatformCatalogController.enablePlatform);
router.patch('/:name/disable', auth_1.requireSuperAdmin, platformCatalog_controller_1.PlatformCatalogController.disablePlatform);
router.delete('/:name', auth_1.requireSuperAdmin, platformCatalog_controller_1.PlatformCatalogController.deletePlatform);
exports.PlatformCatalogRoutes = router;
