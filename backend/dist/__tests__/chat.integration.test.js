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
jest.mock('../app/lib/openrouterClient');
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const db_1 = require("./support/db");
const fixtures_1 = require("./support/fixtures");
const openrouterMock_1 = require("./support/openrouterMock");
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
describe('POST /api/v1/chat', () => {
    it('answers an authenticated question using the mocked LLM, without a real OpenRouter call', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-chat@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)('Your top-performing category this week was AI/ML.');
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), message: 'What was our top-performing category this week?' });
        expect(res.status).toBe(200);
        expect(res.body.data.reply).toBe('Your top-performing category this week was AI/ML.');
        expect(res.body.data.conversation_id).toEqual(expect.any(String));
        const counts = (0, openrouterMock_1.getOpenRouterCallCounts)();
        expect(counts.chatCompletionCalls).toBe(1);
        expect(counts.embeddingCalls).toBe(1);
    }));
    it('continues a conversation when a conversation_id is supplied', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-chat-2@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)('First reply.');
        const firstRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), message: 'First question' });
        const conversationId = firstRes.body.data.conversation_id;
        (0, openrouterMock_1.mockChatCompletion)('Second reply, building on the first.');
        const secondRes = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), message: 'Follow-up question', conversation_id: conversationId });
        expect(secondRes.status).toBe(200);
        expect(secondRes.body.data.conversation_id).toBe(conversationId);
        expect(secondRes.body.data.reply).toBe('Second reply, building on the first.');
    }));
    it('rejects an unauthenticated request', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/chat')
            .send({ team_id: '507f1f77bcf86cd799439011', message: 'Hello?' });
        expect(res.status).toBe(401);
    }));
});
