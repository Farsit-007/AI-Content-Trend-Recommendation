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
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const crypto_1 = require("../app/lib/crypto");
const redis_1 = require("../app/lib/redis");
const platformCredential_model_1 = require("../app/modules/PlatformCredential/platformCredential.model");
const analytics_model_1 = require("../app/modules/Analytics/analytics.model");
const db_1 = require("./support/db");
const fixtures_1 = require("./support/fixtures");
// The immediate post-connect refresh is fire-and-forget; stub it so the suite never touches
// the (unmocked here) embeddings/OpenRouter path.
jest.mock('../app/modules/Analytics/analytics.service', () => ({
    runAnalyticsRefresh: jest.fn().mockResolvedValue({ success: true, teamsProcessed: 0, platformsProcessed: 0 }),
}));
const WEB = 'http://localhost:3000';
/** Minimal Response stand-in for the global fetch mock. */
const jsonResponse = (body, opts = {}) => {
    var _a, _b;
    return ({
        ok: (_a = opts.ok) !== null && _a !== void 0 ? _a : true,
        status: (_b = opts.status) !== null && _b !== void 0 ? _b : 200,
        headers: { get: () => null },
        json: () => __awaiter(void 0, void 0, void 0, function* () { return body; }),
    });
};
let fetchRouter;
beforeAll(db_1.connectTestDb);
afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.clearTestDb)();
    yield redis_1.redis.flushall();
    jest.restoreAllMocks();
}));
afterAll(db_1.disconnectTestDb);
beforeEach(() => {
    global.fetch = jest.fn((input, init) => Promise.resolve(fetchRouter(String(input), init)));
});
describe('MetaOAuth callback — state validation', () => {
    it('redirects with error=invalid_state for an unknown state', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/oauth/facebook/callback?code=abc&state=does-not-exist');
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain(`${WEB}/dashboard/settings/platforms`);
        expect(res.headers.location).toContain('error=invalid_state');
    }));
    it('consumes the state single-use (reuse yields invalid_state)', () => __awaiter(void 0, void 0, void 0, function* () {
        const state = 'reuse-state-123';
        yield redis_1.redis.set(`oauth:fb:${state}`, JSON.stringify({ teamId: 't1', userId: 'u1' }));
        fetchRouter = (url) => {
            if (url.includes('/oauth/access_token') && url.includes('fb_exchange_token')) {
                return jsonResponse({ access_token: 'LONG' });
            }
            if (url.includes('/oauth/access_token'))
                return jsonResponse({ access_token: 'SHORT' });
            if (url.includes('/debug_token')) {
                return jsonResponse({ data: { is_valid: true, scopes: ['pages_show_list'] } });
            }
            return jsonResponse({});
        };
        // First use — state exists, then gets deleted (this path exits at missing_permissions).
        const first = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
        expect(first.headers.location).toContain('error=missing_permissions');
        // Second use — state already consumed.
        const second = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
        expect(second.headers.location).toContain('error=invalid_state');
    }));
    it('redirects with missing_permissions when required scopes are absent', () => __awaiter(void 0, void 0, void 0, function* () {
        const state = 'scope-state';
        yield redis_1.redis.set(`oauth:fb:${state}`, JSON.stringify({ teamId: 't1', userId: 'u1' }));
        fetchRouter = (url) => {
            if (url.includes('fb_exchange_token'))
                return jsonResponse({ access_token: 'LONG' });
            if (url.includes('/oauth/access_token'))
                return jsonResponse({ access_token: 'SHORT' });
            if (url.includes('/debug_token')) {
                return jsonResponse({ data: { is_valid: true, scopes: ['pages_show_list', 'public_profile'] } });
            }
            return jsonResponse({ data: [] });
        };
        const res = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
        expect(res.headers.location).toContain('error=missing_permissions');
        expect(res.headers.location).toContain('read_insights');
    }));
    it('redirects with no_pages when the user administers no pages', () => __awaiter(void 0, void 0, void 0, function* () {
        const state = 'nopages-state';
        yield redis_1.redis.set(`oauth:fb:${state}`, JSON.stringify({ teamId: 't1', userId: 'u1' }));
        fetchRouter = (url) => {
            if (url.includes('fb_exchange_token'))
                return jsonResponse({ access_token: 'LONG' });
            if (url.includes('/oauth/access_token'))
                return jsonResponse({ access_token: 'SHORT' });
            if (url.includes('/debug_token')) {
                return jsonResponse({
                    data: { is_valid: true, scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'] },
                });
            }
            if (url.includes('/me/accounts'))
                return jsonResponse({ data: [] });
            return jsonResponse({});
        };
        const res = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
        expect(res.headers.location).toContain('error=no_pages');
    }));
});
describe('MetaOAuth select-page', () => {
    it('persists encrypted facebook + instagram credentials from a pending candidate', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'meta-admin@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const teamId = team._id.toString();
        const token = (0, fixtures_1.createAuthToken)(admin);
        const pageId = '100000000000001';
        const igId = '200000000000002';
        yield redis_1.redis.set(`oauth:fb:pending:${teamId}`, JSON.stringify([
            {
                id: pageId,
                name: 'Growth Studio Demo',
                encrypted_page_token: (0, crypto_1.encrypt)('PAGE-TOKEN-abcd'),
                ig_user_id: igId,
                ig_username: 'growth.demo',
                scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic'],
            },
        ]));
        fetchRouter = (url) => {
            if (url.includes('/debug_token')) {
                return jsonResponse({ data: { is_valid: true, type: 'PAGE', profile_id: pageId } });
            }
            return jsonResponse({});
        };
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/oauth/facebook/select-page')
            .set('Authorization', `Bearer ${token}`)
            .send({ teamId, pageId });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ page: 'Growth Studio Demo', instagram: true });
        const fb = yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform: 'facebook' }).select('+encrypted_token');
        expect(fb).not.toBeNull();
        expect(fb === null || fb === void 0 ? void 0 : fb.token_type).toBe('page');
        expect(fb === null || fb === void 0 ? void 0 : fb.page_id).toBe(pageId);
        expect(fb === null || fb === void 0 ? void 0 : fb.account_id).toBe(pageId);
        expect(fb === null || fb === void 0 ? void 0 : fb.encrypted_token).toBeTruthy();
        expect(fb === null || fb === void 0 ? void 0 : fb.encrypted_token).not.toContain('PAGE-TOKEN'); // stored encrypted, not plaintext
        const ig = yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform: 'instagram' });
        expect(ig).not.toBeNull();
        expect(ig === null || ig === void 0 ? void 0 : ig.account_id).toBe(igId);
        expect(ig === null || ig === void 0 ? void 0 : ig.page_id).toBe(pageId);
        // Pending key consumed.
        expect(yield redis_1.redis.get(`oauth:fb:pending:${teamId}`)).toBeNull();
    }));
    it('rejects a pageId that is not among the pending candidates', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'meta-admin2@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const teamId = team._id.toString();
        const token = (0, fixtures_1.createAuthToken)(admin);
        yield redis_1.redis.set(`oauth:fb:pending:${teamId}`, JSON.stringify([{ id: 'real-page', name: 'X', encrypted_page_token: (0, crypto_1.encrypt)('t'), scopes: [] }]));
        fetchRouter = () => jsonResponse({});
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/oauth/facebook/select-page')
            .set('Authorization', `Bearer ${token}`)
            .send({ teamId, pageId: 'not-a-candidate' });
        expect(res.status).toBe(400);
    }));
});
describe('MetaOAuth disconnect', () => {
    it('revokes on Meta, deletes both credential rows, and writes not_connected rollups', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'meta-admin3@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const teamId = team._id.toString();
        const authToken = (0, fixtures_1.createAuthToken)(admin);
        const pageId = '300000000000003';
        yield platformCredential_model_1.PlatformCredential.create({
            team_id: teamId,
            platform: 'facebook',
            encrypted_token: (0, crypto_1.encrypt)('PAGE-TOKEN-xyz'),
            token_last4: 'xyz0',
            account_id: pageId,
            added_by: admin._id.toString(),
            token_type: 'page',
            page_id: pageId,
        });
        yield platformCredential_model_1.PlatformCredential.create({
            team_id: teamId,
            platform: 'instagram',
            encrypted_token: (0, crypto_1.encrypt)('PAGE-TOKEN-xyz'),
            token_last4: 'xyz0',
            account_id: 'ig-1',
            added_by: admin._id.toString(),
            token_type: 'page',
            page_id: pageId,
        });
        const revokeCalls = [];
        fetchRouter = (url) => {
            revokeCalls.push(url);
            return jsonResponse({ success: true });
        };
        const res = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/oauth/facebook?teamId=${teamId}`)
            .set('Authorization', `Bearer ${authToken}`);
        expect(res.status).toBe(200);
        expect(revokeCalls.some((u) => u.includes(`/${pageId}/permissions`))).toBe(true);
        expect(yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform: 'facebook' })).toBeNull();
        expect(yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform: 'instagram' })).toBeNull();
        const fbRollup = yield analytics_model_1.AnalyticsRollup.findOne({ team_id: teamId, platform: 'facebook' });
        expect(fbRollup === null || fbRollup === void 0 ? void 0 : fbRollup.status).toBe('not_connected');
    }));
    it('forbids a non-member from disconnecting a team', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'meta-admin4@example.test' });
        const outsider = yield (0, fixtures_1.createTestUser)({ email: 'meta-outsider@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const outsiderToken = (0, fixtures_1.createAuthToken)(outsider);
        fetchRouter = () => jsonResponse({});
        const res = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/oauth/facebook?teamId=${team._id}`)
            .set('Authorization', `Bearer ${outsiderToken}`);
        expect(res.status).toBe(403);
    }));
});
