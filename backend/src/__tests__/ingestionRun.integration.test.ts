import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestUser } from './support/fixtures';
import { IngestionRun } from '../app/modules/IngestionRun/ingestionRun.model';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const seedRuns = (count: number) =>
  IngestionRun.insertMany(
    Array.from({ length: count }, (_, i) => ({
      started_at: new Date(Date.now() - i * 1000),
      finished_at: new Date(Date.now() - i * 1000 + 500),
      duration_ms: 500,
      trigger: 'cron' as const,
      total_stored: 0,
      sources: [],
    })),
  );

describe('GET /api/v1/news-items/ingestion-runs', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/v1/news-items/ingestion-runs');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin caller', async () => {
    const user = await createTestUser({ email: 'non-admin-runs@example.test' });
    const token = createAuthToken(user);

    const res = await request(app).get('/api/v1/news-items/ingestion-runs').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('lets an admin list run history with sourceHealth alongside it', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-runs@example.test' });
    const token = createAuthToken(admin);
    await seedRuns(3);

    const res = await request(app).get('/api/v1/news-items/ingestion-runs').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.runs).toHaveLength(3);
    expect(res.body.data.sourceHealth).toEqual([]);
  });

  it('clamps ?limit= to 100 documents', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-limit@example.test' });
    const token = createAuthToken(admin);
    await seedRuns(105);

    const res = await request(app)
      .get('/api/v1/news-items/ingestion-runs')
      .query({ limit: 500 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.runs).toHaveLength(100);
  });
});
