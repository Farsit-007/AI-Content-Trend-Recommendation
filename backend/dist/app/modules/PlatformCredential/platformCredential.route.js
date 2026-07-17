"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformCredentialRoutes = void 0;
const express_1 = require("express");
const validation_1 = require("../../middleware/validation");
const platformCredential_controller_1 = require("./platformCredential.controller");
const platformCredential_validation_1 = require("./platformCredential.validation");
// Mounted at /teams/:teamId/credentials by team.route.ts — mergeParams is required to see :teamId.
// Auth + team-access are already enforced by the parent router, not repeated here.
const router = (0, express_1.Router)({ mergeParams: true });
router.post('/', (0, validation_1.validation)(platformCredential_validation_1.PlatformCredentialValidation.upsertCredentialValidation), platformCredential_controller_1.PlatformCredentialController.upsertCredential);
router.get('/', platformCredential_controller_1.PlatformCredentialController.listCredentials);
router.get('/:platform/reveal', platformCredential_controller_1.PlatformCredentialController.revealCredential);
router.delete('/:platform', platformCredential_controller_1.PlatformCredentialController.deleteCredential);
exports.PlatformCredentialRoutes = router;
