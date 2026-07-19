jest.mock('../app/modules/NewsItem/newsItem.semanticMatch');

import request from 'supertest';
import app from '../app';
import config from '../app/config';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { addTeamMember, createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { findSemanticallyRelevantItems } from '../app/modules/NewsItem/newsItem.semanticMatch';
import { Team } from '../app/modules/Team/team.model';

const mockedFindSemanticallyRelevantItems = findSemanticallyRelevantItems as jest.MockedFunction<
  typeof findSemanticallyRelevantItems
>;

beforeAll(connectTestDb);
afterEach(() => {
  mockedFindSemanticallyRelevantItems.mockReset();
  return clearTestDb();
});
afterAll(disconnectTestDb);

/** Feed gating now requires team readiness (subscribed_categories + BrandVoiceExample). */
const makeTeamReady = async (teamId: string, categories: string[] = ['AI']) => {
  await Team.findByIdAndUpdate(teamId, { subscribed_categories: categories });
  await BrandVoiceExample.create({
    team_id: teamId,
    platform: 'facebook',
    content: 'Example brand voice post',
    embedding: testEmbedding(),
  });
};

const createNewsItemDoc = (overrides: Partial<Record<string, unknown>> = {}) =>
  NewsItem.create({
    source: 'hackernews',
    source_id: `hn-${Date.now()}-${Math.random()}`,
    content_hash: `hash-${Date.now()}-${Math.random()}`,
    title: 'AI agents are changing how teams ship software',
    url: 'https://example.test/article',
    embedding: testEmbedding(),
    category: 'AI/ML',
    ...overrides,
  });

describe('GET /api/v1/news-items', () => {
  it('lets an unauthenticated caller list news items', async () => {
    await createNewsItemDoc();

    const res = await request(app).get('/api/v1/news-items');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('lets an unauthenticated caller fetch a single news item', async () => {
    const item = await createNewsItemDoc();

    const res = await request(app).get(`/api/v1/news-items/${item._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe(item.title);
  });

  it('omits embedding and content from list responses', async () => {
    await createNewsItemDoc({ content: 'A full article body.', content_status: 'full', word_count: 5 });

    const res = await request(app).get('/api/v1/news-items');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('embedding');
    expect(res.body.data[0]).not.toHaveProperty('content');
    expect(res.body.data[0]).toHaveProperty('content_status', 'full');
    expect(res.body.data[0]).toHaveProperty('word_count', 5);
  });

  it('includes content but omits embedding from the detail response', async () => {
    const item = await createNewsItemDoc({ content: 'A full article body.', content_status: 'full' });

    const res = await request(app).get(`/api/v1/news-items/${item._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('embedding');
    expect(res.body.data.content).toBe('A full article body.');
  });

  it('omits embedding from the detail response even when content_status is none', async () => {
    const item = await createNewsItemDoc();

    const res = await request(app).get(`/api/v1/news-items/${item._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('embedding');
    expect(res.body.data.content_status).toBe('none');
  });
});

describe('Subscription-filtered feed', () => {
  it('filters the feed to a subscribed team member and keeps meta.total accurate', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-sub-feed@example.test' });
    const member = await createTestUser({ email: 'member-sub-feed@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'AI' });
    await createNewsItemDoc({ category: 'AI' });
    await createNewsItemDoc({ category: 'DevOps' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((item: { category: string }) => item.category === 'AI')).toBe(true);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.team_ready).toBe(true);
  });

  it('lets an explicit category param override the subscription filter', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-sub-override@example.test' });
    const member = await createTestUser({ email: 'member-sub-override@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'Security' });

    const res = await request(app)
      .get('/api/v1/news-items?category=Security')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('Security');
  });

  it('does not filter an unauthenticated request', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-sub-unauth@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });

    await createNewsItemDoc({ category: 'AI' });
    await createNewsItemDoc({ category: 'DevOps' });

    const res = await request(app).get('/api/v1/news-items');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('BREAKING (team-readiness-gating): a team with empty subscribed_categories is not ready — feed is empty, not unfiltered', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-sub-empty@example.test' });
    const member = await createTestUser({ email: 'member-sub-empty@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'AI' });
    await createNewsItemDoc({ category: 'DevOps' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.team_ready).toBe(false);
  });
});

describe('Flexible category feed matching (flexible-news-taxonomy-and-relevance)', () => {
  it('a team subscribed to a broad group sees a fine-grained item whose category_group matches', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-flex-1@example.test' });
    const member = await createTestUser({ email: 'member-flex-1@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'LLM Tooling', category_group: 'AI' });
    await createNewsItemDoc({ category: 'DevOps', category_group: 'DevOps' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('LLM Tooling');
  });

  it('a team subscribed to a specific discovered category still excludes a sibling category under the same group', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-flex-2@example.test' });
    const member = await createTestUser({ email: 'member-flex-2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['LLM Tooling']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'LLM Tooling', category_group: 'AI' });
    await createNewsItemDoc({ category: 'AI Hardware', category_group: 'AI' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('LLM Tooling');
  });

  it('an item under a completely unsubscribed group is excluded', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-flex-3@example.test' });
    const member = await createTestUser({ email: 'member-flex-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'Security', category_group: 'Security' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('Semantic "nearly relevant" feed tier (flexible-news-taxonomy-and-relevance)', () => {
  const originalEnabled = config.news_feed.semantic_match_enabled;
  afterEach(() => {
    config.news_feed.semantic_match_enabled = originalEnabled;
  });

  it('is never called when the feature flag is off (default)', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-semantic-off@example.test' });
    const member = await createTestUser({ email: 'member-semantic-off@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);
    await createNewsItemDoc({ category: 'AI' });

    const res = await request(app).get('/api/v1/news-items').set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(mockedFindSemanticallyRelevantItems).not.toHaveBeenCalled();
  });

  it('merges semantic matches into the page and tags them with match_reason, when enabled and room remains', async () => {
    config.news_feed.semantic_match_enabled = true;
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-semantic-on@example.test' });
    const member = await createTestUser({ email: 'member-semantic-on@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'AI' });
    const semanticItem = await createNewsItemDoc({ category: 'Security', category_group: 'Security' });
    mockedFindSemanticallyRelevantItems.mockResolvedValue([
      { _id: semanticItem._id.toString(), similarity_score: 0.9 },
    ]);

    const res = await request(app).get('/api/v1/news-items').set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(mockedFindSemanticallyRelevantItems).toHaveBeenCalledTimes(1);
    expect(res.body.data).toHaveLength(2);
    const semanticEntry = res.body.data.find((item: { _id: string }) => item._id === semanticItem._id.toString());
    expect(semanticEntry).toBeDefined();
    expect(semanticEntry.match_reason).toBe('semantic');
    const exactEntry = res.body.data.find((item: { category: string }) => item.category === 'AI');
    expect(exactEntry.match_reason).toBeUndefined();
  });

  it('is not called when the page is already full from exact/group matches', async () => {
    config.news_feed.semantic_match_enabled = true;
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-semantic-full@example.test' });
    const member = await createTestUser({ email: 'member-semantic-full@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'AI' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockedFindSemanticallyRelevantItems).not.toHaveBeenCalled();
  });

  it('falls back to exact/group results only when the semantic lookup throws', async () => {
    config.news_feed.semantic_match_enabled = true;
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-semantic-error@example.test' });
    const member = await createTestUser({ email: 'member-semantic-error@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);
    await createNewsItemDoc({ category: 'AI' });
    mockedFindSemanticallyRelevantItems.mockRejectedValue(new Error('news_items_vector_index not found'));

    const res = await request(app).get('/api/v1/news-items').set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('is not called when an explicit ?category= param is present (team subscription is bypassed entirely)', async () => {
    config.news_feed.semantic_match_enabled = true;
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-semantic-explicit-cat@example.test' });
    const member = await createTestUser({ email: 'member-semantic-explicit-cat@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);
    await createNewsItemDoc({ category: 'AI' });

    const res = await request(app)
      .get('/api/v1/news-items?category=AI')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(mockedFindSemanticallyRelevantItems).not.toHaveBeenCalled();
  });
});

describe('Team readiness gating', () => {
  it('returns team_ready: false and an empty feed for a team with categories but no brand-voice examples', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-ready-categories-only@example.test' });
    const member = await createTestUser({ email: 'member-ready-categories-only@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await Team.findByIdAndUpdate(team._id, { subscribed_categories: ['AI'] });
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'AI' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.team_ready).toBe(false);
  });

  it('returns team_ready: true and the filtered feed for a fully-ready team', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-ready-full@example.test' });
    const member = await createTestUser({ email: 'member-ready-full@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await makeTeamReady(team._id.toString(), ['AI']);
    const memberToken = createAuthToken(member);

    await createNewsItemDoc({ category: 'AI' });

    const res = await request(app)
      .get('/api/v1/news-items')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.team_ready).toBe(true);
  });

  it('does not gate an unauthenticated/no-team request', async () => {
    await createNewsItemDoc({ category: 'AI' });

    const res = await request(app).get('/api/v1/news-items');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.team_ready).toBeUndefined();
  });
});

describe('News item create/update/delete', () => {
  it('lets an admin create, update, and delete a news item', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-crud@example.test' });
    const adminToken = createAuthToken(admin);

    const createRes = await request(app)
      .post('/api/v1/news-items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        source: 'devto',
        source_id: 'devto-123',
        content_hash: 'hash-abc-123',
        title: 'New framework release',
        url: 'https://example.test/devto-post',
        embedding: testEmbedding(),
      });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data._id;

    const updateRes = await request(app)
      .patch(`/api/v1/news-items/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated title' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toBe('Updated title');

    const deleteRes = await request(app)
      .delete(`/api/v1/news-items/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const getRes = await request(app).get(`/api/v1/news-items/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('rejects unauthenticated writes', async () => {
    const item = await createNewsItemDoc();

    const createRes = await request(app).post('/api/v1/news-items').send({ title: 'x' });
    expect(createRes.status).toBe(401);

    const updateRes = await request(app).patch(`/api/v1/news-items/${item._id}`).send({ title: 'x' });
    expect(updateRes.status).toBe(401);

    const deleteRes = await request(app).delete(`/api/v1/news-items/${item._id}`);
    expect(deleteRes.status).toBe(401);
  });

  it('rejects a non-admin write', async () => {
    const user = await createTestUser({ email: 'non-admin-write@example.test' });
    const token = createAuthToken(user);
    const item = await createNewsItemDoc();

    const res = await request(app)
      .delete(`/api/v1/news-items/${item._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/news-items/ingest', () => {
  it('rejects a non-admin triggering ingestion', async () => {
    const user = await createTestUser({ email: 'non-admin-ingest@example.test' });
    const token = createAuthToken(user);

    const res = await request(app).post('/api/v1/news-items/ingest').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated ingestion trigger', async () => {
    const res = await request(app).post('/api/v1/news-items/ingest');
    expect(res.status).toBe(401);
  });
});

describe('News item category override', () => {
  it('lets a team member set and clear a category override, reflected on subsequent fetch', async () => {
    // Overrides are only surfaced to callers with actual team_ids membership (see
    // NewsItemService.getAllNewsItems/getSingleNewsItem), so an admin who isn't a member of
    // `team` would not see it reflected even though `assertTeamAccess` would let them set it.
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-override@example.test' });
    const member = await createTestUser({ email: 'member-override@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    const memberToken = createAuthToken(member);
    const item = await createNewsItemDoc({ category: 'AI/ML' });

    const setRes = await request(app)
      .patch(`/api/v1/news-items/${item._id}/override`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ team_id: team._id.toString(), category: 'Security' });
    expect(setRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/v1/news-items/${item._id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.category).toBe('Security');
    expect(getRes.body.data.is_overridden).toBe(true);

    const clearRes = await request(app)
      .delete(`/api/v1/news-items/${item._id}/override`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ team_id: team._id.toString() });
    expect(clearRes.status).toBe(200);

    const getAfterClearRes = await request(app)
      .get(`/api/v1/news-items/${item._id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(getAfterClearRes.body.data.category).toBe('AI/ML');
    expect(getAfterClearRes.body.data.is_overridden).toBe(false);
  });
});
