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
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
const createNewsItemDoc = (overrides = {}) => newsItem_model_1.NewsItem.create(Object.assign({ source: 'hackernews', source_id: `hn-${Date.now()}-${Math.random()}`, content_hash: `hash-${Date.now()}-${Math.random()}`, title: 'AI agents are changing how teams ship software', url: 'https://example.test/article', embedding: (0, fixtures_1.testEmbedding)(), category: 'AI/ML' }, overrides));
describe('GET /api/v1/news-items', () => {
    it('lets an unauthenticated caller list news items', () => __awaiter(void 0, void 0, void 0, function* () {
        yield createNewsItemDoc();
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/news-items');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    }));
    it('lets an unauthenticated caller fetch a single news item', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield createNewsItemDoc();
        const res = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/news-items/${item._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.title).toBe(item.title);
    }));
    it('omits embedding and content from list responses', () => __awaiter(void 0, void 0, void 0, function* () {
        yield createNewsItemDoc({ content: 'A full article body.', content_status: 'full', word_count: 5 });
        const res = yield (0, supertest_1.default)(app_1.default).get('/api/v1/news-items');
        expect(res.status).toBe(200);
        expect(res.body.data[0]).not.toHaveProperty('embedding');
        expect(res.body.data[0]).not.toHaveProperty('content');
        expect(res.body.data[0]).toHaveProperty('content_status', 'full');
        expect(res.body.data[0]).toHaveProperty('word_count', 5);
    }));
    it('includes content but omits embedding from the detail response', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield createNewsItemDoc({ content: 'A full article body.', content_status: 'full' });
        const res = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/news-items/${item._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data).not.toHaveProperty('embedding');
        expect(res.body.data.content).toBe('A full article body.');
    }));
    it('omits embedding from the detail response even when content_status is none', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield createNewsItemDoc();
        const res = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/news-items/${item._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data).not.toHaveProperty('embedding');
        expect(res.body.data.content_status).toBe('none');
    }));
});
describe('News item create/update/delete', () => {
    it('lets an admin create, update, and delete a news item', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-crud@example.test' });
        const adminToken = (0, fixtures_1.createAuthToken)(admin);
        const createRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/news-items')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
            source: 'devto',
            source_id: 'devto-123',
            content_hash: 'hash-abc-123',
            title: 'New framework release',
            url: 'https://example.test/devto-post',
            embedding: (0, fixtures_1.testEmbedding)(),
        });
        expect(createRes.status).toBe(201);
        const id = createRes.body.data._id;
        const updateRes = yield (0, supertest_1.default)(app_1.default)
            .patch(`/api/v1/news-items/${id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ title: 'Updated title' });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.title).toBe('Updated title');
        const deleteRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/news-items/${id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(deleteRes.status).toBe(200);
        const getRes = yield (0, supertest_1.default)(app_1.default).get(`/api/v1/news-items/${id}`);
        expect(getRes.status).toBe(404);
    }));
    it('rejects unauthenticated writes', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield createNewsItemDoc();
        const createRes = yield (0, supertest_1.default)(app_1.default).post('/api/v1/news-items').send({ title: 'x' });
        expect(createRes.status).toBe(401);
        const updateRes = yield (0, supertest_1.default)(app_1.default).patch(`/api/v1/news-items/${item._id}`).send({ title: 'x' });
        expect(updateRes.status).toBe(401);
        const deleteRes = yield (0, supertest_1.default)(app_1.default).delete(`/api/v1/news-items/${item._id}`);
        expect(deleteRes.status).toBe(401);
    }));
    it('rejects a non-admin write', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'non-admin-write@example.test' });
        const token = (0, fixtures_1.createAuthToken)(user);
        const item = yield createNewsItemDoc();
        const res = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/news-items/${item._id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    }));
});
describe('POST /api/v1/news-items/ingest', () => {
    it('rejects a non-admin triggering ingestion', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield (0, fixtures_1.createTestUser)({ email: 'non-admin-ingest@example.test' });
        const token = (0, fixtures_1.createAuthToken)(user);
        const res = yield (0, supertest_1.default)(app_1.default).post('/api/v1/news-items/ingest').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    }));
    it('rejects an unauthenticated ingestion trigger', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default).post('/api/v1/news-items/ingest');
        expect(res.status).toBe(401);
    }));
});
describe('News item category override', () => {
    it('lets a team member set and clear a category override, reflected on subsequent fetch', () => __awaiter(void 0, void 0, void 0, function* () {
        // Overrides are only surfaced to callers with actual team_ids membership (see
        // NewsItemService.getAllNewsItems/getSingleNewsItem), so an admin who isn't a member of
        // `team` would not see it reflected even though `assertTeamAccess` would let them set it.
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-override@example.test' });
        const member = yield (0, fixtures_1.createTestUser)({ email: 'member-override@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        yield (0, fixtures_1.addTeamMember)(team._id.toString(), member._id.toString());
        const memberToken = (0, fixtures_1.createAuthToken)(member);
        const item = yield createNewsItemDoc({ category: 'AI/ML' });
        const setRes = yield (0, supertest_1.default)(app_1.default)
            .patch(`/api/v1/news-items/${item._id}/override`)
            .set('Authorization', `Bearer ${memberToken}`)
            .send({ team_id: team._id.toString(), category: 'Security' });
        expect(setRes.status).toBe(200);
        const getRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/news-items/${item._id}`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.data.category).toBe('Security');
        expect(getRes.body.data.is_overridden).toBe(true);
        const clearRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/news-items/${item._id}/override`)
            .set('Authorization', `Bearer ${memberToken}`)
            .send({ team_id: team._id.toString() });
        expect(clearRes.status).toBe(200);
        const getAfterClearRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/news-items/${item._id}`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(getAfterClearRes.body.data.category).toBe('AI/ML');
        expect(getAfterClearRes.body.data.is_overridden).toBe(false);
    }));
});
