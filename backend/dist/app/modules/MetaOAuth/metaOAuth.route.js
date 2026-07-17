"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaOAuthRoutes = void 0;
const express_1 = require("express");
const express_2 = __importDefault(require("express"));
const auth_1 = require("../../middleware/auth");
const validation_1 = require("../../middleware/validation");
const metaOAuth_controller_1 = require("./metaOAuth.controller");
const metaOAuth_validation_1 = require("./metaOAuth.validation");
const router = (0, express_1.Router)();
// --- Unauthenticated routes (the browser / Meta arrive without our JWT) ---
// Callback is state-validated; data-deletion is signed-request-validated. Query params are read
// directly (the shared `validation` middleware only covers body/cookies, not query).
router.get('/callback', metaOAuth_controller_1.MetaOAuthController.callback);
router.post('/data-deletion', express_2.default.urlencoded({ extended: true }), metaOAuth_controller_1.MetaOAuthController.dataDeletion);
// --- Authenticated routes (team member/admin) ---
// teamId arrives as a query param on GET/DELETE, so those are validated in the controller.
router.get('/connect', auth_1.requireAuth, metaOAuth_controller_1.MetaOAuthController.connect);
router.get('/pages', auth_1.requireAuth, metaOAuth_controller_1.MetaOAuthController.pages);
router.post('/select-page', auth_1.requireAuth, (0, validation_1.validation)(metaOAuth_validation_1.MetaOAuthValidation.selectPageValidation), metaOAuth_controller_1.MetaOAuthController.selectPage);
router.delete('/', auth_1.requireAuth, metaOAuth_controller_1.MetaOAuthController.disconnect);
exports.MetaOAuthRoutes = router;
