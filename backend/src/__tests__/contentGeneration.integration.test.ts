jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';
import { getOpenRouterCallCounts, mockChatCompletion, mockEmbedding } from './support/openrouterMock';

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
});
