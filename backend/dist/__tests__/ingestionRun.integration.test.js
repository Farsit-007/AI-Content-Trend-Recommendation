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
const ingestionRun_model_1 = require("../app/modules/IngestionRun/ingestionRun.model");
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
const seedRuns = (count) => ingestionRun_model_1.IngestionRun.insertMany(Array.from({ length: count }, (_, i) => ({
    started_at: new Date(Date.now() - i * 1000),
    finished_at: new Date(Date.now() - i * 1000 + 500),
    duration_ms: 500,
    trigger: 'cron',
    total_stored: 0,
    sources: [],
})));
describe('GET /api/v1/news-items/ingestion-runs', () => {
    it('rejects an unauthenticated caller', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/news-items/ingestion-runs');
        expect(res.status).toBe(401);
    }));
    it('rejects a non-admin caller', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'non-admin-runs@example.test' });
        const token = (0, fixtures_1.createAuthToken)(user);
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/news-items/ingestion-runs').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    }));
    it('lets an admin list run history with sourceHealth alongside it', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-runs@example.test' });
        const token = (0, fixtures_1.createAuthToken)(admin);
        yield seedRuns(3);
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/news-items/ingestion-runs').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.runs).toHaveLength(3);
        expect(res.body.data.sourceHealth).toEqual([]);
    }));
    it('clamps ?limit= to 100 documents', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-limit@example.test' });
        const token = (0, fixtures_1.createAuthToken)(admin);
        yield seedRuns(105);
        const res = yield (0, supertest_1.default)(app_1.default)
            .get('/api/v1/news-items/ingestion-runs')
            .query({ limit: 500 })
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.runs).toHaveLength(100);
    }));
});
