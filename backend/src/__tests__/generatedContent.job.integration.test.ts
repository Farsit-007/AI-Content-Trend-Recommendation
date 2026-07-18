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
import config from '../app/config';
import { encrypt } from '../app/lib/crypto';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { LlmModel, LlmProvider } from '../app/modules/LlmProvider/llmProvider.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { Team } from '../app/modules/Team/team.model';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { GeneratedContent } from '../app/modules/GeneratedContent/generatedContent.model';
import { getOpenRouterCallCounts, mockChatCompletion, mockEmbedding } from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(() => {
  mockOpenAIChatCreate.mockReset();
  return clearTestDb();
});
afterAll(disconnectTestDb);

// The job's default generation now makes one plain-text LLM call per format (facebook_post,
// linkedin_post) rather than one JSON call for all five — every mocked call in this file returns
// the same plain-text body, which is fine since these tests assert draft counts/format keys, not content.
const CANNED_TEXT = 'Check out our latest AI update! Teams that adopt this early win.';

const createNewsItemDoc = (overrides: Partial<Record<string, unknown>> = {}) =>
  NewsItem.create({
    source: 'hackernews',
    source_id: `hn-${Date.now()}-${Math.random()}`,
    content_hash: `hash-${Date.now()}-${Math.random()}`,
    title: 'AI agents are changing how teams ship software',
    url: 'https://example.test/article',
    embedding: testEmbedding(),
    category: 'AI',
    opportunity_score: 8,
    trend_score: 8,
    created_at: new Date(),
    ...overrides,
  });

describe('POST /api/v1/generated-content/run — team-scoped, freshness-windowed selection', () => {
  it('drafts only the fresh, subscribed-category item for a team subscribed to AI', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-1@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });

    const freshAi = await createNewsItemDoc({ category: 'AI', title: 'Fresh AI item' });
    await createNewsItemDoc({ category: 'DevOps', title: 'Fresh DevOps item' });
    await createNewsItemDoc({
      category: 'AI',
      title: 'Stale AI item',
      created_at: new Date(Date.now() - 100 * 3600 * 1000),
    });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.drafts_created).toBe(1);

    const drafts = await GeneratedContent.find({ team_id: team._id.toString() });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.news_item_id).toBe(freshAi._id.toString());

    // Stored draft's formats holds exactly the new default pair — no other format keys.
    const formats = drafts[0]?.formats;
    expect(formats?.facebook_post).toBe(CANNED_TEXT);
    expect(formats?.linkedin_post).toBe(CANNED_TEXT);
    expect(formats?.facebook_reel_script).toBeUndefined();
    expect(formats?.youtube_idea).toBeUndefined();
    expect(formats?.caption).toBeUndefined();
  });

  it('creates no drafts when every high-opportunity item is stale', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-2@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });

    await createNewsItemDoc({
      category: 'AI',
      title: 'Stale item',
      created_at: new Date(Date.now() - 100 * 3600 * 1000),
    });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.drafts_created).toBe(0);
  });

  it('selects across all subscribed categories for a team subscribed to more than one', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-3@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI', 'DevOps'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });

    await createNewsItemDoc({ category: 'AI', title: 'Fresh AI item' });
    await createNewsItemDoc({ category: 'DevOps', title: 'Fresh DevOps item' });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.drafts_created).toBe(2);
  });

  it('(team-readiness-gating) skips a team with empty subscribed_categories — not ready even with brand voice', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-not-ready@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });

    await createNewsItemDoc({ category: 'AI', title: 'Fresh AI item' });
    await createNewsItemDoc({ category: 'DevOps', title: 'Fresh DevOps item' });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.drafts_created).toBe(0);
    expect(res.body.data.skipped).toBeGreaterThanOrEqual(1);

    const drafts = await GeneratedContent.find({ team_id: team._id.toString() });
    expect(drafts).toHaveLength(0);
  });

  it('excludes an archived item even when it is fresh and high-opportunity', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-4@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });

    await createNewsItemDoc({
      category: 'AI',
      title: 'Archived AI item',
      lifecycle: 'archived',
      archived_at: new Date(),
      archive_reason: 'trend_floor',
    });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data.drafts_created).toBe(0);
  });
});

describe('POST /api/v1/generated-content/run — model_used reflects the actually-resolved model', () => {
  it('stores the static bootstrap model when no LlmProvider is configured', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-modelused-1@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });
    await createNewsItemDoc({ category: 'AI', title: 'Fresh AI item' });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    const draft = await GeneratedContent.findOne({ team_id: team._id.toString() });
    expect(draft?.model_used).toBe(config.llm_model_content);
  });

  it("stores the team's configured default model, not the static import, once one is set", async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-modelused-2@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });
    await createNewsItemDoc({ category: 'AI', title: 'Fresh AI item' });

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
      model_id: 'openrouter/autogen-team-default',
      display_name: 'Autogen Team Default',
      capabilities: ['chat'],
      is_active: true,
    });
    await Team.findByIdAndUpdate(team._id, { default_models: { content_generation: model._id.toString() } });

    mockEmbedding();
    mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: { content: CANNED_TEXT } }] });

    const res = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(res.status).toBe(200);
    const draft = await GeneratedContent.findOne({ team_id: team._id.toString() });
    expect(draft?.model_used).toBe('openrouter/autogen-team-default');
    expect(draft?.model_used).not.toBe(config.llm_model_content);
  });
});

describe('POST /api/v1/generated-content/run — idempotency is independent of response caching', () => {
  it('running the job twice in a row creates zero new drafts and makes zero further LLM calls on the second run', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-idempotent@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    await BrandVoiceExample.create({
      team_id: team._id.toString(),
      platform: 'facebook',
      content: 'Example brand voice post',
      embedding: testEmbedding(),
    });

    await createNewsItemDoc({ category: 'AI', title: 'Fresh AI item' });

    mockEmbedding();
    mockChatCompletion(CANNED_TEXT);

    const firstRes = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.drafts_created).toBe(1);
    const callsAfterFirstRun = getOpenRouterCallCounts().chatCompletionCalls;

    const secondRes = await request(app)
      .post('/api/v1/generated-content/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team._id.toString() });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.drafts_created).toBe(0);
    // The persisted-draft check (GeneratedContent.exists) is what makes this idempotent — not any
    // response cache, which this change removes entirely (see generation-cache-rework).
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(callsAfterFirstRun);

    const drafts = await GeneratedContent.find({ team_id: team._id.toString() });
    expect(drafts).toHaveLength(1);
  });
});
