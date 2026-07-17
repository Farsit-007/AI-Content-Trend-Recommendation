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
describe('Platform credentials', () => {
    it('lets a team member upsert, list, reveal, and delete a credential', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-credentials@example.test' });
        const member = yield (0, fixtures_1.createTestUser)({ email: 'member-credentials@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        yield (0, fixtures_1.addTeamMember)(team._id.toString(), member._id.toString());
        yield (0, fixtures_1.enablePlatformForTeam)(team._id.toString(), 'facebook', admin._id.toString());
        const memberToken = (0, fixtures_1.createAuthToken)(member);
        const upsertRes = yield (0, supertest_1.default)(app_1.default)
            .post(`/api/v1/teams/${team._id}/credentials`)
            .set('Authorization', `Bearer ${memberToken}`)
            .send({ platform: 'facebook', token: 'super-secret-token-1234' });
        expect(upsertRes.status).toBe(201);
        const listRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}/credentials`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(listRes.status).toBe(200);
        expect(listRes.body.data).toHaveLength(1);
        expect(listRes.body.data[0].token_last4).toBe('1234');
        const revealRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}/credentials/facebook/reveal`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(revealRes.status).toBe(200);
        expect(revealRes.body.data.token).toBe('super-secret-token-1234');
        const deleteRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/teams/${team._id}/credentials/facebook`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(deleteRes.status).toBe(200);
        const revealAfterDeleteRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}/credentials/facebook/reveal`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(revealAfterDeleteRes.status).toBe(404);
    }));
    it('rejects an outsider listing, revealing, or deleting a team credential', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-credentials-2@example.test' });
        const outsider = yield (0, fixtures_1.createTestUser)({ email: 'outsider-credentials@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        yield (0, fixtures_1.enablePlatformForTeam)(team._id.toString(), 'facebook', admin._id.toString());
        const outsiderToken = (0, fixtures_1.createAuthToken)(outsider);
        const listRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}/credentials`)
            .set('Authorization', `Bearer ${outsiderToken}`);
        expect(listRes.status).toBe(403);
        const revealRes = yield (0, supertest_1.default)(app_1.default)
            .get(`/api/v1/teams/${team._id}/credentials/facebook/reveal`)
            .set('Authorization', `Bearer ${outsiderToken}`);
        expect(revealRes.status).toBe(403);
        const deleteRes = yield (0, supertest_1.default)(app_1.default)
            .delete(`/api/v1/teams/${team._id}/credentials/facebook`)
            .set('Authorization', `Bearer ${outsiderToken}`);
        expect(deleteRes.status).toBe(403);
    }));
});
