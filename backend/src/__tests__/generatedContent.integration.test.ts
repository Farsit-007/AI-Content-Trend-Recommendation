import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';
import { GeneratedContent } from '../app/modules/GeneratedContent/generatedContent.model';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('POST /api/v1/generated-content — manual draft persistence', () => {
  it('coexists with an auto-drafted document for the same pair, both listed', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-manual-draft-1@example.test' });
    const token = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const newsItemId = '507f1f77bcf86cd799439011';

    await GeneratedContent.create({
      team_id: team._id.toString(),
      news_item_id: newsItemId,
      topic: 'Auto-drafted topic',
      formats: { facebook_post: 'Auto post' },
      source: 'auto',
      status: 'draft',
    });

    const res = await request(app)
      .post('/api/v1/generated-content')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team_id: team._id.toString(),
        news_item_id: newsItemId,
        topic: 'Manually saved topic',
        formats: { facebook_post: 'Manual post' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe('manual');
    expect(res.body.data.status).toBe('draft');

    // NOTE: GET /generated-content is not exercised via HTTP here — its `listGeneratedContentValidation`
    // schema requires `query.team_id`, but the shared `validation()` middleware only ever forwards
    // `{ body, cookies }` to zod (a pre-existing, cross-cutting bug affecting several other endpoints
    // too, e.g. GET /analytics, GET /reports), so any request through it 400s regardless of the query
    // string sent. Verifying coexistence directly against the collection instead.
    const stored = await GeneratedContent.find({ team_id: team._id.toString(), news_item_id: newsItemId });
    expect(stored).toHaveLength(2);
    expect(stored.map((d) => d.source).sort()).toEqual(['auto', 'manual']);
  });

  it('allows a second manual draft for the same pair (uniqueness scoped to source: auto)', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-manual-draft-2@example.test' });
    const token = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const newsItemId = '507f1f77bcf86cd799439012';

    const first = await request(app)
      .post('/api/v1/generated-content')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), news_item_id: newsItemId, topic: 'Variant 1', formats: { caption: 'A' } });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/generated-content')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), news_item_id: newsItemId, topic: 'Variant 2', formats: { caption: 'B' } });
    expect(second.status).toBe(201);

    const count = await GeneratedContent.countDocuments({ team_id: team._id.toString(), news_item_id: newsItemId });
    expect(count).toBe(2);
  });

  it('still rejects a direct duplicate source:auto insert for the same pair', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-manual-draft-3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const newsItemId = '507f1f77bcf86cd799439013';

    await GeneratedContent.create({
      team_id: team._id.toString(),
      news_item_id: newsItemId,
      topic: 'First auto draft',
      formats: { facebook_post: 'A' },
      source: 'auto',
      status: 'draft',
    });

    await expect(
      GeneratedContent.create({
        team_id: team._id.toString(),
        news_item_id: newsItemId,
        topic: 'Second auto draft',
        formats: { facebook_post: 'B' },
        source: 'auto',
        status: 'draft',
      }),
    ).rejects.toThrow(/E11000/);
  });

  it('saves a topic-only manual draft with no news_item_id', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-manual-draft-4@example.test' });
    const token = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });

    const res = await request(app)
      .post('/api/v1/generated-content')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'Freeform topic', formats: { caption: 'A caption' } });

    expect(res.status).toBe(201);
    expect(res.body.data.news_item_id).toBeFalsy();
  });

  it('rejects a draft with no populated formats', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-manual-draft-5@example.test' });
    const token = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });

    const res = await request(app)
      .post('/api/v1/generated-content')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), topic: 'Empty formats', formats: {} });

    expect(res.status).toBe(400);
  });

  it('rejects a non-member saving a draft for another team', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-manual-draft-6@example.test' });
    const outsider = await createTestUser({ email: 'outsider-manual-draft@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const outsiderToken = createAuthToken(outsider);

    const res = await request(app)
      .post('/api/v1/generated-content')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ team_id: team._id.toString(), topic: 'Should fail', formats: { caption: 'A' } });

    expect(res.status).toBe(403);
  });
});
