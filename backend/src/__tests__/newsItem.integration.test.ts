import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { addTeamMember, createAuthToken, createTestTeam, createTestUser, testEmbedding } from './support/fixtures';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

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

describe('News item create/update/delete', () => {
  it('lets an admin create, update, and delete a news item', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-crud@example.test' });
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
    const admin = await createTestUser({ role: 'admin', email: 'admin-override@example.test' });
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
