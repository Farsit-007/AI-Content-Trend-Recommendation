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
const db_1 = require("./support/db");
const fixtures_1 = require("./support/fixtures");
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
describe('POST /api/v1/auth/login', () => {
    it('logs in with valid credentials and returns a usable token', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'login-success@example.test' });
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: fixtures_1.TEST_PASSWORD });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.data.token).toEqual(expect.any(String));
        expect(loginRes.body.data.user.email).toBe(user.email);
        const meRes = yield (0, supertest_1.default)(app_1.default)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${loginRes.body.data.token}`);
        expect(meRes.status).toBe(200);
        expect(meRes.body.data.user.email).toBe(user.email);
    }));
    it('rejects an incorrect password', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'login-bad-password@example.test' });
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: 'wrong-password' });
        expect(res.status).toBe(401);
    }));
    it('rejects a login for an email with no account', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: 'nobody@example.test', password: fixtures_1.TEST_PASSWORD });
        expect(res.status).toBe(401);
    }));
});
describe('GET /api/v1/auth/me', () => {
    it('rejects a request with no Authorization header', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/auth/me');
        expect(res.status).toBe(401);
    }));
    it('rejects a malformed token', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
        expect(res.status).toBe(401);
    }));
    it('rejects a token for a user that no longer exists', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'deleted-user@example.test' });
        const token = (0, fixtures_1.createAuthToken)(user);
        yield user.deleteOne();
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
    }));
});
describe('POST /api/v1/auth/refresh-token', () => {
    it('exchanges a refresh token for a new usable access token', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'refresh@example.test' });
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: fixtures_1.TEST_PASSWORD });
        expect(loginRes.body.data.refresh_token).toEqual(expect.any(String));
        const refreshRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/refresh-token')
            .send({ refresh_token: loginRes.body.data.refresh_token });
        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.data.token).toEqual(expect.any(String));
        const meRes = yield (0, supertest_1.default)(app_1.default)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${refreshRes.body.data.token}`);
        expect(meRes.status).toBe(200);
    }));
    it('rejects an access token used as a refresh token', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'refresh-with-access@example.test' });
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: fixtures_1.TEST_PASSWORD });
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/refresh-token')
            .send({ refresh_token: loginRes.body.data.token });
        expect(res.status).toBe(401);
    }));
    it('rejects a refresh token used as an access token', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'access-with-refresh@example.test' });
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: fixtures_1.TEST_PASSWORD });
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${loginRes.body.data.refresh_token}`);
        expect(res.status).toBe(401);
    }));
    it('rejects a missing refresh token', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).post('/api/v1/auth/refresh-token').send({});
        expect(res.status).toBe(401);
    }));
});
describe('POST /api/v1/auth/logout', () => {
    it('clears the refresh cookie', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const res = yield (0, supertest_1.default)(app_1.default).post('/api/v1/auth/logout');
        expect(res.status).toBe(200);
        const setCookie = (_b = (_a = res.headers['set-cookie']) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : '';
        expect(setCookie).toContain('refresh_token=;');
    }));
});
describe('POST /api/v1/auth/change-password', () => {
    it('changes the password, invalidates old tokens, and returns a fresh pair', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'change-pass@example.test' });
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: fixtures_1.TEST_PASSWORD });
        const oldToken = loginRes.body.data.token;
        // Ensure the old token's iat second is strictly before password_changed_at.
        yield new Promise((r) => setTimeout(r, 1100));
        const changeRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/change-password')
            .set('Authorization', `Bearer ${oldToken}`)
            .send({ old_password: fixtures_1.TEST_PASSWORD, new_password: 'NewPassword456!' });
        expect(changeRes.status).toBe(200);
        expect(changeRes.body.data.token).toEqual(expect.any(String));
        // Old token is dead, new one works, new password logs in.
        const oldTokenRes = yield (0, supertest_1.default)(app_1.default).get('/api/v1/auth/me').set('Authorization', `Bearer ${oldToken}`);
        expect(oldTokenRes.status).toBe(401);
        const newTokenRes = yield (0, supertest_1.default)(app_1.default)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${changeRes.body.data.token}`);
        expect(newTokenRes.status).toBe(200);
        const reloginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: 'NewPassword456!' });
        expect(reloginRes.status).toBe(200);
    }));
    it('rejects a wrong current password', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'change-pass-wrong@example.test' });
        const token = (0, fixtures_1.createAuthToken)(user);
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/change-password')
            .set('Authorization', `Bearer ${token}`)
            .send({ old_password: 'not-the-password', new_password: 'NewPassword456!' });
        expect(res.status).toBe(401);
    }));
});
describe('POST /api/v1/auth/forgot-password + reset-password', () => {
    it('issues a reset token and resets the password with it', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'forgot-pass@example.test' });
        const forgotRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/forgot-password')
            .send({ email: user.email });
        expect(forgotRes.status).toBe(200);
        const resetToken = forgotRes.body.data.reset_token;
        expect(resetToken).toEqual(expect.any(String));
        const resetRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/reset-password')
            .send({ token: resetToken, new_password: 'ResetPassword789!' });
        expect(resetRes.status).toBe(200);
        const loginRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: 'ResetPassword789!' });
        expect(loginRes.status).toBe(200);
    }));
    it('responds identically for an unknown email (no enumeration)', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/forgot-password')
            .send({ email: 'nobody-here@example.test' });
        expect(res.status).toBe(200);
        expect(res.body.data).toBeNull();
    }));
    it('rejects reusing a reset token after the password has changed', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'reset-reuse@example.test' });
        const forgotRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/forgot-password')
            .send({ email: user.email });
        const resetToken = forgotRes.body.data.reset_token;
        // iat has 1s granularity — wait so password_changed_at lands after the token's iat.
        yield new Promise((r) => setTimeout(r, 1100));
        const firstRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/reset-password')
            .send({ token: resetToken, new_password: 'ResetOnce111!' });
        expect(firstRes.status).toBe(200);
        const secondRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/auth/reset-password')
            .send({ token: resetToken, new_password: 'ResetTwice222!' });
        expect(secondRes.status).toBe(401);
    }));
});
