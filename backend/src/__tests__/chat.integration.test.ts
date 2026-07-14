jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';
import { getOpenRouterCallCounts, mockChatCompletion, mockEmbedding } from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('POST /api/v1/chat', () => {
  it('answers an authenticated question using the mocked LLM, without a real OpenRouter call', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-chat@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion('Your top-performing category this week was AI/ML.');

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'What was our top-performing category this week?' });

    expect(res.status).toBe(200);
    expect(res.body.data.reply).toBe('Your top-performing category this week was AI/ML.');
    expect(res.body.data.conversation_id).toEqual(expect.any(String));

    const counts = getOpenRouterCallCounts();
    expect(counts.chatCompletionCalls).toBe(1);
    expect(counts.embeddingCalls).toBe(1);
  });

  it('continues a conversation when a conversation_id is supplied', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-chat-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    mockEmbedding();
    mockChatCompletion('First reply.');
    const firstRes = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'First question' });
    const conversationId = firstRes.body.data.conversation_id;

    mockChatCompletion('Second reply, building on the first.');
    const secondRes = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'Follow-up question', conversation_id: conversationId });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.conversation_id).toBe(conversationId);
    expect(secondRes.body.data.reply).toBe('Second reply, building on the first.');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ team_id: '507f1f77bcf86cd799439011', message: 'Hello?' });

    expect(res.status).toBe(401);
  });
});
