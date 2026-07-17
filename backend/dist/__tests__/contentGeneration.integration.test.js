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
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const openrouterMock_1 = require("./support/openrouterMock");
const createNewsItemDoc = (overrides = {}) => newsItem_model_1.NewsItem.create(Object.assign({ source: 'producthunt', source_id: `ph-${Date.now()}-${Math.random()}`, content_hash: `hash-${Date.now()}-${Math.random()}`, title: 'A new open-source tool for streaming LLM output', url: 'https://example.test/launch-post', embedding: (0, fixtures_1.testEmbedding)(), category: 'AI/ML' }, overrides));
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
const CANNED_CONTENT = {
    facebook_post: 'Check out our latest AI update!',
    facebook_reel_script: 'Hook: AI is changing everything. Body: ... Call to action: follow for more.',
    linkedin_post: 'Excited to share how AI agents are reshaping content workflows.',
    caption: 'AI agents, meet your new best friend. #AI #GrowthStudio',
    youtube_idea: {
        title: 'How AI Agents Are Changing Content Creation',
        hook: 'What if your content strategy ran itself?',
        chapters: ['Intro', 'The problem', 'The AI solution', 'Results'],
        thumbnail_concept: 'A robot hand holding a glowing content calendar',
    },
};
describe('POST /api/v1/content/generate', () => {
    it('generates content for an authenticated user using the mocked LLM, without a real OpenRouter call', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-content-gen@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)(JSON.stringify(CANNED_CONTENT));
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });
        expect(res.status).toBe(200);
        expect(res.body.data.topic).toBe('AI agents in content marketing');
        expect(res.body.data.facebook_post).toBe(CANNED_CONTENT.facebook_post);
        expect(res.body.data.youtube_idea.title).toBe(CANNED_CONTENT.youtube_idea.title);
        // Confirms the route went through the mock, not a real network call to OpenRouter.
        const counts = (0, openrouterMock_1.getOpenRouterCallCounts)();
        expect(counts.chatCompletionCalls).toBe(1);
        expect(counts.embeddingCalls).toBe(1);
    }));
    it('rejects an unauthenticated request', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .send({ team_id: '507f1f77bcf86cd799439011', topic: 'AI agents' });
        expect(res.status).toBe(401);
    }));
    it('defaults the prompt to Bangla and includes the team custom instructions', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-voice-default@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({
            createdBy: admin._id.toString(),
            voiceProfile: { default_language: 'bangla', custom_instructions: 'Always end with a question.' },
        });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)(JSON.stringify(CANNED_CONTENT));
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });
        expect(res.status).toBe(200);
        const systemPrompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[0].content;
        expect(systemPrompt).toContain('Bengali (বাংলা script)');
        expect(systemPrompt).toContain('Always end with a question.');
    }));
    it('lets the request language override the team default', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-voice-override@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({
            createdBy: admin._id.toString(),
            voiceProfile: { default_language: 'bangla' },
        });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)(JSON.stringify(CANNED_CONTENT));
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), topic: 'AI agents', language: 'english' });
        expect(res.status).toBe(200);
        const systemPrompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[0].content;
        expect(systemPrompt).toContain('Write in clear, natural English.');
        expect(systemPrompt).not.toContain('বাংলা');
    }));
    it('includes the resolved news item\'s snippet and url in the generation prompt', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-content-gen-snippet@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        const newsItem = yield createNewsItemDoc({
            snippet: 'A new open-source tool for streaming LLM output with backpressure support.',
            impact_note: 'Relevant to dev-tool audiences',
        });
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)(JSON.stringify(CANNED_CONTENT));
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({
            team_id: team._id.toString(),
            topic: newsItem.title,
            news_item_id: newsItem._id.toString(),
        });
        expect(res.status).toBe(200);
        const userPrompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[1].content;
        expect(userPrompt).toContain('source snippet: "A new open-source tool for streaming LLM output with backpressure support."');
        expect(userPrompt).toContain(`source: ${newsItem.url}`);
        // Confirms resolveNewsItemContext used the news item's stored embedding, not a fresh embed call.
        const counts = (0, openrouterMock_1.getOpenRouterCallCounts)();
        expect(counts.embeddingCalls).toBe(0);
    }));
    it('includes the anti-hallucination grounding instruction in the system prompt', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-content-gen-grounding@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)(JSON.stringify(CANNED_CONTENT));
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });
        expect(res.status).toBe(200);
        const systemPrompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[0].content;
        expect(systemPrompt).toContain('do not invent specific facts, numbers, quotes, features, or dates');
    }));
    it('falls back to the topic-only prompt when the news_item_id does not resolve', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-content-gen-invalid-id@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        (0, openrouterMock_1.mockEmbedding)();
        (0, openrouterMock_1.mockChatCompletion)(JSON.stringify(CANNED_CONTENT));
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({
            team_id: team._id.toString(),
            topic: 'AI agents in content marketing',
            news_item_id: '507f1f77bcf86cd799439011',
        });
        expect(res.status).toBe(200);
        const userPrompt = (0, openrouterMock_1.getLastChatCompletionRequest)().messages[1].content;
        expect(userPrompt).toBe('Generate content about: "AI agents in content marketing"');
        // Falls back to embedding the raw topic text since the news item didn't resolve.
        const counts = (0, openrouterMock_1.getOpenRouterCallCounts)();
        expect(counts.embeddingCalls).toBe(1);
    }));
    it('rejects an invalid language value', () => __awaiter(void 0, void 0, void 0, function* () {
        const admin = yield (0, fixtures_1.createTestUser)({ role: 'admin', email: 'admin-voice-invalid@example.test' });
        const team = yield (0, fixtures_1.createTestTeam)({ createdBy: admin._id.toString() });
        const token = (0, fixtures_1.createAuthToken)(admin);
        const res = yield (0, supertest_1.default)(app_1.default)
            .post('/api/v1/content/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ team_id: team._id.toString(), topic: 'AI agents', language: 'french' });
        expect(res.status).toBe(400);
    }));
});
