jest.mock('../app/lib/openrouterClient');

const mockOpenAIChatCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAIChatCreate } },
    embeddings: { create: jest.fn() },
  }));
});

import request from 'supertest';
import app from '../app';
import { encrypt } from '../app/lib/crypto';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { ChatMessage } from '../app/modules/Chat/chat.model';
import { LlmModel, LlmProvider } from '../app/modules/LlmProvider/llmProvider.model';
import { Team } from '../app/modules/Team/team.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { getOpenRouterCallCounts, mockChatCompletion, mockEmbedding } from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(() => {
  mockOpenAIChatCreate.mockReset();
  return clearTestDb();
});
afterAll(disconnectTestDb);

/** Chat now gates on team readiness (subscribed_categories + BrandVoiceExample) — most tests in
 *  this file are about chat behavior once a team is past that gate, so this helper sets both up. */
const makeTeamReady = async (teamId: string) => {
  await Team.findByIdAndUpdate(teamId, { subscribed_categories: ['AI'] });
  await BrandVoiceExample.create({
    team_id: teamId,
    platform: 'facebook',
    content: 'Example brand voice post',
    embedding: testEmbedding(),
  });
};

describe('POST /api/v1/chat', () => {
  it('answers an authenticated question using the mocked LLM, without a real OpenRouter call', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await makeTeamReady(team._id.toString());
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
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await makeTeamReady(team._id.toString());
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

  it("resolves through the team's default_models[chat] — hits the adapter, not the bootstrap client", async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-team-default@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await makeTeamReady(team._id.toString());
    const token = createAuthToken(admin);

    const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'Configured OpenRouter', is_active: true });
    provider.keys.push({
      encrypted_key: encrypt('real-configured-key'),
      key_last4: '9999',
      is_active: true,
      created_at: new Date(),
    } as never);
    await provider.save();
    const model = await LlmModel.create({
      provider_id: provider._id,
      model_id: 'openrouter/chat-team-default',
      display_name: 'Chat Team Default',
      capabilities: ['chat'],
      is_active: true,
    });
    await Team.findByIdAndUpdate(team._id, { default_models: { chat: model._id.toString() } });

    mockEmbedding();
    mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: { content: 'Answered via the configured model.' } }] });

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'What was our top-performing category this week?' });

    expect(res.status).toBe(200);
    expect(res.body.data.reply).toBe('Answered via the configured model.');
    expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
  });
});

describe('POST /api/v1/chat — team readiness gating', () => {
  it('returns fixed guidance and makes no embedding/LLM call for a not-ready team (no categories, no brand voice)', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-not-ready-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'What is trending?' });

    expect(res.status).toBe(200);
    expect(res.body.data.reply.length).toBeGreaterThan(0);
    expect(res.body.data.conversation_id).toEqual(expect.any(String));
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(0);
  });

  it('returns fixed guidance for a team with categories but no brand-voice examples', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-not-ready-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'What is trending?' });

    expect(res.status).toBe(200);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(0);
  });

  it('persists the user message and the guidance reply to ChatMessage for conversation continuity', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-not-ready-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'What is trending?' });

    const { ChatMessage } = await import('../app/modules/Chat/chat.model');
    const messages = await ChatMessage.find({ team_id: team._id.toString(), conversation_id: res.body.data.conversation_id }).sort({
      created_at: 1,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('What is trending?');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe(res.body.data.reply);
  });

  it('responds in the requested language even when the team is not ready', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-not-ready-4@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), message: 'What is trending?', language: 'english' });

    expect(res.status).toBe(200);
    expect(res.body.data.reply).toMatch(/Team Settings/);
  });
});

describe('GET /api/v1/chat/conversations', () => {
  it('lists a team\'s conversations, most recently active first, with preview and count', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-list-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const older = new Date(Date.now() - 60_000);
    const newer = new Date();
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-old', role: 'user', content: 'Old question', created_at: older });
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-old', role: 'assistant', content: 'Old reply', created_at: older });
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-new', role: 'user', content: 'New question', created_at: newer });
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-new', role: 'assistant', content: 'New reply', created_at: newer });

    const res = await request(app)
      .get('/api/v1/chat/conversations')
      .query({ team_id: team._id.toString() })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].conversation_id).toBe('conv-new');
    expect(res.body.data[0].message_count).toBe(2);
    expect(res.body.data[0].last_message_preview).toBe('New reply');
    expect(res.body.data[1].conversation_id).toBe('conv-old');
  });

  it('returns an empty list for a team with no chat history yet', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-list-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);

    const res = await request(app)
      .get('/api/v1/chat/conversations')
      .query({ team_id: team._id.toString() })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('truncates a long last message to the preview cap', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-list-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const longContent = 'x'.repeat(300);
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-long', role: 'assistant', content: longContent });

    const res = await request(app)
      .get('/api/v1/chat/conversations')
      .query({ team_id: team._id.toString() })
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data[0].last_message_preview.length).toBeLessThan(longContent.length);
    expect(res.body.data[0].last_message_preview.endsWith('…')).toBe(true);
  });

  it('rejects a non-member requesting another team\'s conversations', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-list-4@example.test' });
    const outsider = await createTestUser({ email: 'outsider-chat-list@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const outsiderToken = createAuthToken(outsider);

    const res = await request(app)
      .get('/api/v1/chat/conversations')
      .query({ team_id: team._id.toString() })
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/chat/conversations').query({ team_id: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(401);
  });

  it('rejects a request with no team_id query param', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-list-5@example.test' });
    const token = createAuthToken(admin);

    const res = await request(app).get('/api/v1/chat/conversations').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/chat/conversations/:conversationId', () => {
  it('returns every message in the conversation, in chronological order', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-chat-get-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(admin);
    const t0 = new Date(Date.now() - 120_000);
    const t1 = new Date(Date.now() - 60_000);
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-1', role: 'assistant', content: 'Second turn', created_at: t1 });
    await ChatMessage.create({ team_id: team._id.toString(), conversation_id: 'conv-1', role: 'user', content: 'First turn', created_at: t0 });

    const res = await request(app)
      .get('/api/v1/chat/conversations/conv-1')
      .query({ team_id: team._id.toString() })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].content).toBe('First turn');
    expect(res.body.data[1].content).toBe('Second turn');
  });

  it('does not leak another team\'s conversation — empty result, not another team\'s messages', async () => {
    const admin1 = await createTestUser({ role: 'super_admin', email: 'admin-chat-get-2a@example.test' });
    const team1 = await createTestTeam({ createdBy: admin1._id.toString() });
    const admin2 = await createTestUser({ role: 'super_admin', email: 'admin-chat-get-2b@example.test' });
    const team2 = await createTestTeam({ createdBy: admin2._id.toString() });
    const token2 = createAuthToken(admin2);

    await ChatMessage.create({ team_id: team1._id.toString(), conversation_id: 'shared-id', role: 'user', content: 'Team 1 secret question' });

    const res = await request(app)
      .get('/api/v1/chat/conversations/shared-id')
      .query({ team_id: team2._id.toString() })
      .set('Authorization', `Bearer ${token2}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .get('/api/v1/chat/conversations/some-id')
      .query({ team_id: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(401);
  });
});
