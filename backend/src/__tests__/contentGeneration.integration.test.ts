jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import {
  getLastChatCompletionRequest,
  getOpenRouterCallCounts,
  mockChatCompletion,
  mockEmbedding,
} from './support/openrouterMock';

const createNewsItemDoc = (overrides: Partial<Record<string, unknown>> = {}) =>
  NewsItem.create({
    source: 'producthunt',
    source_id: `ph-${Date.now()}-${Math.random()}`,
    content_hash: `hash-${Date.now()}-${Math.random()}`,
    title: 'A new open-source tool for streaming LLM output',
    url: 'https://example.test/launch-post',
    embedding: testEmbedding(),
    category: 'AI/ML',
    ...overrides,
  });

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

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
  it('generates content for an authenticated user using the mocked LLM, without a real OpenRouter call', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-content-gen@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(JSON.stringify(CANNED_CONTENT));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });

    expect(res.status).toBe(200);
    expect(res.body.data.topic).toBe('AI agents in content marketing');
    expect(res.body.data.facebook_post).toBe(CANNED_CONTENT.facebook_post);
    expect(res.body.data.youtube_idea.title).toBe(CANNED_CONTENT.youtube_idea.title);

    // Confirms the route went through the mock, not a real network call to OpenRouter.
    const counts = getOpenRouterCallCounts();
    expect(counts.chatCompletionCalls).toBe(1);
    expect(counts.embeddingCalls).toBe(1);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/content/generate')
      .send({ team_id: '507f1f77bcf86cd799439011', topic: 'AI agents' });

    expect(res.status).toBe(401);
  });

  it('defaults the prompt to Bangla and includes the team custom instructions', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-voice-default@example.test' });
    const team = await createTestTeam({
      createdBy: admin._id.toString(),
      voiceProfile: { default_language: 'bangla', custom_instructions: 'Always end with a question.' },
    });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(JSON.stringify(CANNED_CONTENT));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('Bengali (বাংলা script)');
    expect(systemPrompt).toContain('Always end with a question.');
  });

  it('lets the request language override the team default', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-voice-override@example.test' });
    const team = await createTestTeam({
      createdBy: admin._id.toString(),
      voiceProfile: { default_language: 'bangla' },
    });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(JSON.stringify(CANNED_CONTENT));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', language: 'english' });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('Write in clear, natural English.');
    expect(systemPrompt).not.toContain('বাংলা');
  });

  it('includes the resolved news item\'s snippet and url in the generation prompt', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-content-gen-snippet@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const newsItem = await createNewsItemDoc({
      snippet: 'A new open-source tool for streaming LLM output with backpressure support.',
      impact_note: 'Relevant to dev-tool audiences',
    });

    mockEmbedding();
    mockChatCompletion(JSON.stringify(CANNED_CONTENT));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: newsItem.title,
        news_item_id: newsItem._id.toString(),
      });

    expect(res.status).toBe(200);
    const userPrompt = getLastChatCompletionRequest().messages[1].content;
    expect(userPrompt).toContain('source snippet: "A new open-source tool for streaming LLM output with backpressure support."');
    expect(userPrompt).toContain(`source: ${newsItem.url}`);

    // Confirms resolveNewsItemContext used the news item's stored embedding, not a fresh embed call.
    const counts = getOpenRouterCallCounts();
    expect(counts.embeddingCalls).toBe(0);
  });

  it('includes the anti-hallucination grounding instruction in the system prompt', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-content-gen-grounding@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(JSON.stringify(CANNED_CONTENT));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents in content marketing' });

    expect(res.status).toBe(200);
    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('do not invent specific facts, numbers, quotes, features, or dates');
  });

  it('falls back to the topic-only prompt when the news_item_id does not resolve', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-content-gen-invalid-id@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion(JSON.stringify(CANNED_CONTENT));

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        topic: 'AI agents in content marketing',
        news_item_id: '507f1f77bcf86cd799439011',
      });

    expect(res.status).toBe(200);
    const userPrompt = getLastChatCompletionRequest().messages[1].content;
    expect(userPrompt).toBe('Generate content about: "AI agents in content marketing"');

    // Falls back to embedding the raw topic text since the news item didn't resolve.
    const counts = getOpenRouterCallCounts();
    expect(counts.embeddingCalls).toBe(1);
  });

  it('rejects an invalid language value', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-voice-invalid@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/content/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'AI agents', language: 'french' });

    expect(res.status).toBe(400);
  });
});
