jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { Team } from '../app/modules/Team/team.model';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { GeneratedContent } from '../app/modules/GeneratedContent/generatedContent.model';
import { mockChatCompletion, mockEmbedding } from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(clearTestDb);
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

  it('selects across all categories for a team with empty subscribed_categories', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-3@example.test' });
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
    expect(res.body.data.drafts_created).toBe(2);
  });

  it('excludes an archived item even when it is fresh and high-opportunity', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-autogen-4@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
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
