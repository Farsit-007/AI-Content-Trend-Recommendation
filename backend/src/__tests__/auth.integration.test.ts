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

describe('POST /api/v1/auth/refresh-token', () => {
  it('exchanges a refresh token for a new usable access token', async () => {
    const user = await createTestUser({ email: 'refresh@example.test' });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(loginRes.body.data.refresh_token).toEqual(expect.any(String));

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refresh_token: loginRes.body.data.refresh_token });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.token).toEqual(expect.any(String));

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.token}`);
    expect(meRes.status).toBe(200);
  });

  it('rejects an access token used as a refresh token', async () => {
    const user = await createTestUser({ email: 'refresh-with-access@example.test' });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refresh_token: loginRes.body.data.token });
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token used as an access token', async () => {
    const user = await createTestUser({ email: 'access-with-refresh@example.test' });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.refresh_token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a missing refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh-token').send({});
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toContain('refresh_token=;');
  });
});

describe('POST /api/v1/auth/change-password', () => {
  it('changes the password, invalidates old tokens, and returns a fresh pair', async () => {
    const user = await createTestUser({ email: 'change-pass@example.test' });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const oldToken = loginRes.body.data.token;

    // Ensure the old token's iat second is strictly before password_changed_at.
    await new Promise((r) => setTimeout(r, 1100));

    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ old_password: TEST_PASSWORD, new_password: 'NewPassword456!' });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.data.token).toEqual(expect.any(String));

    // Old token is dead, new one works, new password logs in.
    const oldTokenRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(oldTokenRes.status).toBe(401);

    const newTokenRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${changeRes.body.data.token}`);
    expect(newTokenRes.status).toBe(200);

    const reloginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'NewPassword456!' });
    expect(reloginRes.status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const user = await createTestUser({ email: 'change-pass-wrong@example.test' });
    const token = createAuthToken(user);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ old_password: 'not-the-password', new_password: 'NewPassword456!' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password + reset-password', () => {
  it('issues a reset token and resets the password with it', async () => {
    const user = await createTestUser({ email: 'forgot-pass@example.test' });

    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    expect(forgotRes.status).toBe(200);
    const resetToken = forgotRes.body.data.reset_token;
    expect(resetToken).toEqual(expect.any(String));

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, new_password: 'ResetPassword789!' });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'ResetPassword789!' });
    expect(loginRes.status).toBe(200);
  });

  it('responds identically for an unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody-here@example.test' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('rejects reusing a reset token after the password has changed', async () => {
    const user = await createTestUser({ email: 'reset-reuse@example.test' });

    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    const resetToken = forgotRes.body.data.reset_token;

    // iat has 1s granularity — wait so password_changed_at lands after the token's iat.
    await new Promise((r) => setTimeout(r, 1100));

    const firstRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, new_password: 'ResetOnce111!' });
    expect(firstRes.status).toBe(200);

    const secondRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, new_password: 'ResetTwice222!' });
    expect(secondRes.status).toBe(401);
  });
});
