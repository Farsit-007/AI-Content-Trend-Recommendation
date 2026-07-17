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
describe('Team CRUD', () => {
    it('lets an admin create a team and add/remove a member', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-team-crud@example.test' });
        const member = yield (0, fixtures_1.createTestUser)({ email: 'member-to-add@example.test' });
        const adminToken = (0, fixtures_1.createAuthToken)(admin);
        const createRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/teams')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Growth Team' });
        expect(createRes.status).toBe(201);
        const teamId = createRes.body.data._id;
        const addRes = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/v1/teams/${teamId}/members`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ user_id: member._id.toString() });
        expect(addRes.status).toBe(201);
        const getRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${teamId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.data.members).toContain(member._id.toString());
        const removeRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/teams/${teamId}/members/${member._id.toString()}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(removeRes.status).toBe(200);
    }));
    it('lets an admin update and delete a team', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-update-delete@example.test' });
        const adminToken = (0, fixtures_1.createAuthToken)(admin);
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const updateRes = yield (0, supertest_1.default)(app_1.default)
            .patch(`/api/v1/teams/${team._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Renamed Team' });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.name).toBe('Renamed Team');
        const deleteRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/teams/${team._id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(deleteRes.status).toBe(200);
    }));
    it('rejects a non-admin creating a team', () => __awaiter(void 0, void 0, void 0, function* () {
        const member = yield (0, fixtures_1.createTestUser)({ email: 'non-admin-create-team@example.test' });
        const token = (0, fixtures_1.createAuthToken)(member);
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/teams')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Should Not Be Created' });
        expect(res.status).toBe(403);
    }));
    it('rejects a non-member fetching another team', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-owns-team@example.test' });
        const outsider = yield (0, fixtures_1.createTestUser)({ email: 'outsider-team@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const outsiderToken = (0, fixtures_1.createAuthToken)(outsider);
        const res = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}`)
            .set('Authorization', `Bearer ${outsiderToken}`);
        expect(res.status).toBe(403);
    }));
});
describe('Team categories', () => {
    it('lets a team member add and remove a custom category', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-categories@example.test' });
        const member = yield (0, fixtures_1.createTestUser)({ email: 'member-categories@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        yield (0, fixtures_1.addTeamMember)(team._id.toString(), member._id.toString());
        const memberToken = (0, fixtures_1.createAuthToken)(member);
        const addRes = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/v1/teams/${team._id}/categories`)
            .set('Authorization', `Bearer ${memberToken}`)
            .send({ category: 'Robotics' });
        expect(addRes.status).toBe(201);
        expect(addRes.body.data.custom_categories).toContain('Robotics');
        const removeRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/teams/${team._id}/categories/Robotics`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(removeRes.status).toBe(200);
    }));
    it('rejects a non-member accessing team categories', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-categories-2@example.test' });
        const outsider = yield (0, fixtures_1.createTestUser)({ email: 'outsider-categories@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const outsiderToken = (0, fixtures_1.createAuthToken)(outsider);
        const res = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}/categories`)
            .set('Authorization', `Bearer ${outsiderToken}`);
        expect(res.status).toBe(403);
    }));
});
