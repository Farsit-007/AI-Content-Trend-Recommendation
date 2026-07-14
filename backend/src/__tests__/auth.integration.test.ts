import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { TEST_PASSWORD, createAuthToken, createTestUser } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('POST /api/v1/auth/login', () => {
  it('logs in with valid credentials and returns a usable token', async () => {
    const user = await createTestUser({ email: 'login-success@example.test' });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toEqual(expect.any(String));
    expect(loginRes.body.data.user.email).toBe(user.email);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(user.email);
  });

  it('rejects an incorrect password', async () => {
    const user = await createTestUser({ email: 'login-bad-password@example.test' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects a login for an email with no account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a token for a user that no longer exists', async () => {
    const user = await createTestUser({ email: 'deleted-user@example.test' });
    const token = createAuthToken(user);
    await user.deleteOne();

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
