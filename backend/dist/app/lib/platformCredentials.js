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
exports.isPlatformConfigured = exports.getPlatformToken = exports.KNOWN_PLATFORMS = void 0;
const crypto_1 = require("./crypto");
const platforms_1 = require("./platforms");
Object.defineProperty(exports, "KNOWN_PLATFORMS", { enumerable: true, get: function () { return platforms_1.KNOWN_PLATFORMS; } });
const platformCredential_model_1 = require("../modules/PlatformCredential/platformCredential.model");
const platformCatalog_service_1 = require("../modules/PlatformCatalog/platformCatalog.service");
/**
 * Resolves a platform token from the team's own stored credential only.
 * Returns null when the team hasn't added credentials or the platform is disabled —
 * callers should treat null as "not connected" and degrade gracefully.
 *
 * No .env bootstrap fallback: credentials are team-owned, added via the frontend.
 */
const getPlatformToken = (platform, teamId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(yield platformCatalog_service_1.PlatformCatalogService.isTeamPlatformEnabled(teamId, platform)))
        return null;
    const credential = yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform }).select('+encrypted_token');
    return credential ? (0, crypto_1.decrypt)(credential.encrypted_token) : null;
});
exports.getPlatformToken = getPlatformToken;
/** Whether a team currently has a usable credential for a platform. */
const isPlatformConfigured = (platform, teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const token = yield (0, exports.getPlatformToken)(platform, teamId);
    return token !== null;
});
exports.isPlatformConfigured = isPlatformConfigured;
