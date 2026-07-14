import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestUser } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('POST /api/v1/users', () => {
  it('lets an admin create a user', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-creates-user@example.test' });
    const token = createAuthToken(admin);

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new-user@example.test', password: 'Password123!', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('new-user@example.test');
  });

  it('rejects a non-admin creating a user', async () => {
    const member = await createTestUser({ role: 'user', email: 'member-creates-user@example.test' });
    const token = createAuthToken(member);

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'blocked-user@example.test', password: 'Password123!', name: 'Blocked User' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/users', () => {
  it('lets an admin list users', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-lists-users@example.test' });
    await createTestUser({ email: 'another-user@example.test' });
    const token = createAuthToken(admin);

    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});
