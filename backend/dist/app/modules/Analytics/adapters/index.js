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
exports.getAdapter = exports.isMockAdapter = void 0;
const config_1 = __importDefault(require("../../../config"));
const facebook_1 = require("./facebook");
const instagram_1 = require("./instagram");
const linkedin_1 = require("./linkedin");
const mock_1 = require("./mock");
/**
 * Platforms with a WORKING real adapter. youtube is intentionally absent — in real mode a platform
 * without a real adapter serves NO data and reports pending approval (never fake numbers). LinkedIn
 * is registered, but its adapter itself returns `pending_approval` until the Community Management
 * API product is approved on the app.
 */
const REAL_ADAPTERS = {
    facebook: facebook_1.facebookAdapter,
    instagram: instagram_1.instagramAdapter,
    linkedin: linkedin_1.linkedinAdapter,
};
/**
 * Whether the resolved adapter serves mock (demo) data. Mock data is produced ONLY when the global
 * switch is on (the test default); with it off, no platform ever returns mock numbers.
 */
const isMockAdapter = () => config_1.default.analytics.use_mock_adapters;
exports.isMockAdapter = isMockAdapter;
const getAdapter = (platform) => {
    // Global master switch (the test default) forces every platform to mock.
    if (config_1.default.analytics.use_mock_adapters) {
        return (_token, teamId, plat) => (0, mock_1.mockAdapter)(teamId, plat);
    }
    const real = REAL_ADAPTERS[platform];
    const realEnabled = config_1.default.analytics.real_platforms.includes(platform);
    if (real && realEnabled) {
        return (token, _teamId, _plat, accountId) => real(token, accountId !== null && accountId !== void 0 ? accountId : '');
    }
    // Real mode + no real adapter for this platform: report pending approval, never demo data.
    return () => __awaiter(void 0, void 0, void 0, function* () { return ({ status: 'pending_approval', posts: [] }); });
};
exports.getAdapter = getAdapter;
