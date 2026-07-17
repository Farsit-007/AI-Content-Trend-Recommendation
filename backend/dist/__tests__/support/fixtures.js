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
exports.enablePlatformForTeam = exports.testEmbedding = exports.addTeamMember = exports.createTestTeam = exports.createAuthToken = exports.createTestUser = exports.TEST_PASSWORD = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../../app/config"));
const user_model_1 = require("../../app/modules/User/user.model");
const team_model_1 = require("../../app/modules/Team/team.model");
const platformCatalog_model_1 = require("../../app/modules/PlatformCatalog/platformCatalog.model");
exports.TEST_PASSWORD = 'Password123!';
// Low bcrypt cost keeps the suite fast — this is test-only, never production data.
const TEST_BCRYPT_COST = 4;
let counter = 0;
const uniqueEmail = () => `user-${Date.now()}-${counter++}@example.test`;
const createTestUser = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (overrides = {}) {
    var _a, _b, _c, _d;
    const password = (_a = overrides.password) !== null && _a !== void 0 ? _a : exports.TEST_PASSWORD;
    const password_hash = yield bcrypt_1.default.hash(password, TEST_BCRYPT_COST);
    return user_model_1.User.create({
        email: (_b = overrides.email) !== null && _b !== void 0 ? _b : uniqueEmail(),
        password_hash,
        name: (_c = overrides.name) !== null && _c !== void 0 ? _c : 'Test User',
        role: (_d = overrides.role) !== null && _d !== void 0 ? _d : 'user',
    });
});
exports.createTestUser = createTestUser;
const createAuthToken = (user) => jsonwebtoken_1.default.sign({ id: user._id.toString(), email: user.email }, config_1.default.jwt_secret, {
    expiresIn: config_1.default.jwt_expires_in,
});
exports.createAuthToken = createAuthToken;
const createTestTeam = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (overrides = {}) {
    var _a, _b;
    return team_model_1.Team.create(Object.assign({ name: (_a = overrides.name) !== null && _a !== void 0 ? _a : 'Test Team', created_by: (_b = overrides.createdBy) !== null && _b !== void 0 ? _b : 'test-seed' }, (overrides.voiceProfile ? { voice_profile: overrides.voiceProfile } : {})));
});
exports.createTestTeam = createTestTeam;
const addTeamMember = (teamId, userId) => __awaiter(void 0, void 0, void 0, function* () { return team_model_1.TeamMembership.create({ team_id: teamId, user_id: userId }); });
exports.addTeamMember = addTeamMember;
/** A valid 1536-dimension embedding vector — matches `NewsItem.embedding`'s schema validator. */
const testEmbedding = () => Array(1536).fill(0.01);
exports.testEmbedding = testEmbedding;
/** Enables a platform both globally (catalog) and for a specific team, satisfying `assertTeamPlatformEnabled`. */
const enablePlatformForTeam = (teamId, platform, enabledBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield platformCatalog_model_1.PlatformCatalog.create({ name: platform, is_enabled: true, created_by: enabledBy });
    yield platformCatalog_model_1.TeamPlatform.create({ team_id: teamId, platform, is_enabled: true, enabled_by: enabledBy });
});
exports.enablePlatformForTeam = enablePlatformForTeam;
