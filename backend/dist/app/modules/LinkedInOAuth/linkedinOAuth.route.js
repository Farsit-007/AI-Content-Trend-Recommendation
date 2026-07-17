"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInOAuthRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const validation_1 = require("../../middleware/validation");
const linkedinOAuth_controller_1 = require("./linkedinOAuth.controller");
const linkedinOAuth_validation_1 = require("./linkedinOAuth.validation");
const router = (0, express_1.Router)();
// --- Unauthenticated route (the browser / LinkedIn arrive without our JWT) ---
// Callback is state-validated. Query params are read directly (the shared `validation` middleware
// only covers body/cookies, not query).
router.get('/callback', linkedinOAuth_controller_1.LinkedInOAuthController.callback);
// --- Authenticated routes (team member/admin) ---
// teamId arrives as a query param on GET/DELETE, so those are validated in the controller.
router.get('/connect', auth_1.requireAuth, linkedinOAuth_controller_1.LinkedInOAuthController.connect);
router.get('/orgs', auth_1.requireAuth, linkedinOAuth_controller_1.LinkedInOAuthController.orgs);
router.post('/select-org', auth_1.requireAuth, (0, validation_1.validation)(linkedinOAuth_validation_1.LinkedInOAuthValidation.selectOrgValidation), linkedinOAuth_controller_1.LinkedInOAuthController.selectOrg);
router.delete('/', auth_1.requireAuth, linkedinOAuth_controller_1.LinkedInOAuthController.disconnect);
exports.LinkedInOAuthRoutes = router;
