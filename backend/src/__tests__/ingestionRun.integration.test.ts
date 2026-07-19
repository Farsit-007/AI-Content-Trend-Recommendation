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
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-runs@example.test' });
    const token = createAuthToken(admin);
    await seedRuns(3);

    const res = await request(app).get('/api/v1/news-items/ingestion-runs').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.runs).toHaveLength(3);
    expect(res.body.data.sourceHealth).toEqual([]);
  });

  it('clamps ?limit= to 100 documents', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-limit@example.test' });
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

describe('GET /api/v1/news-items/last-ingested-at', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/v1/news-items/last-ingested-at');
    expect(res.status).toBe(401);
  });

  it('lets a non-admin authenticated user call it successfully', async () => {
    const user = await createTestUser({ email: 'non-admin-last-ingested@example.test' });
    const token = createAuthToken(user);
    await seedRuns(2);

    const res = await request(app)
      .get('/api/v1/news-items/last-ingested-at')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns a null shape when no ingestion run has ever completed', async () => {
    const user = await createTestUser({ email: 'non-admin-last-ingested-empty@example.test' });
    const token = createAuthToken(user);

    const res = await request(app)
      .get('/api/v1/news-items/last-ingested-at')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ run_id: null, finished_at: null });
  });

  it('reflects the most recently finished run, regardless of trigger type', async () => {
    const user = await createTestUser({ email: 'non-admin-last-ingested-recency@example.test' });
    const token = createAuthToken(user);

    const older = await IngestionRun.create({
      started_at: new Date(Date.now() - 10_000),
      finished_at: new Date(Date.now() - 9_000),
      duration_ms: 1000,
      trigger: 'cron',
      total_stored: 0,
      sources: [],
    });
    const newer = await IngestionRun.create({
      started_at: new Date(Date.now() - 2_000),
      finished_at: new Date(Date.now() - 1_000),
      duration_ms: 1000,
      trigger: 'manual',
      total_stored: 0,
      sources: [],
    });

    const res = await request(app)
      .get('/api/v1/news-items/last-ingested-at')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.run_id).toBe(newer._id.toString());
    expect(res.body.data.run_id).not.toBe(older._id.toString());
  });

  it('does not leak per-source counts, errors, or trigger type (admin-only detail stays admin-only)', async () => {
    const user = await createTestUser({ email: 'non-admin-last-ingested-shape@example.test' });
    const token = createAuthToken(user);
    await IngestionRun.create({
      started_at: new Date(),
      finished_at: new Date(),
      duration_ms: 1000,
      trigger: 'cron',
      total_stored: 5,
      sources: [{ source: 'hackernews', fetched: 10, fresh_dropped: 0, hash_deduped: 0, semantic_deduped: 0, relevance_dropped: 0, stored: 5 }],
      error: 'some admin-only detail',
    });

    const res = await request(app)
      .get('/api/v1/news-items/last-ingested-at')
      .set('Authorization', `Bearer ${token}`);

    expect(Object.keys(res.body.data).sort()).toEqual(['finished_at', 'run_id']);
  });
});
