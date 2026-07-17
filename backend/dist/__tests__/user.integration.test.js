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
describe('POST /api/v1/users', () => {
    it('lets an admin create a user', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-creates-user@example.test' });
        const token = (0, fixtures_1.createAuthToken)(admin);
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'new-user@example.test', password: 'Password123!', name: 'New User' });
        expect(res.status).toBe(201);
        expect(res.body.data.email).toBe('new-user@example.test');
    }));
    it('rejects a non-admin creating a user', () => __awaiter(void 0, void 0, void 0, function* () {
        const member = yield (0, fixtures_1.createTestUser)({ role: 'user', email: 'member-creates-user@example.test' });
        const token = (0, fixtures_1.createAuthToken)(member);
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${token}`)
            .send({ email: 'blocked-user@example.test', password: 'Password123!', name: 'Blocked User' });
        expect(res.status).toBe(403);
    }));
});
describe('GET /api/v1/users', () => {
    it('lets an admin list users', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-lists-users@example.test' });
        yield (0, fixtures_1.createTestUser)({ email: 'another-user@example.test' });
        const token = (0, fixtures_1.createAuthToken)(admin);
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    }));
});
