import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';

/**
 * Request-id correlation — Phase 8.
 *
 * The point is not the header for its own sake: it is that a user reporting "it failed" can be
 * matched to the exact request in the logs. So the two things worth pinning are that the id is
 * always present on the way out, and that an untrusted inbound value can never become the id —
 * otherwise a caller could inject newlines and forge log entries.
 */

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('X-Request-Id', () => {
  it('assigns an id to every response, even an unauthenticated failure', async () => {
    const res = await request(app).get('/api/v1/chat/conversations');

    expect(res.status).toBe(401);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed inbound id so a trace can span the proxy and the API', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', 'edge-abc_123');

    expect(res.headers['x-request-id']).toBe('edge-abc_123');
  });

  it('replaces an id carrying newlines rather than trusting it', async () => {
    // A forged value here would let a caller write arbitrary lines into the log.
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', 'abc def');

    expect(res.headers['x-request-id']).not.toContain('def');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces an over-long id rather than letting it flood the log', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', 'x'.repeat(500));

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('includes the id in an error body, so a screenshot is enough to find the request', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Request-Id', 'trace-me-1')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.request_id).toBe('trace-me-1');
  });

  it('gives concurrent requests distinct ids', async () => {
    // AsyncLocalStorage is the mechanism; this is the property that would break if the context
    // were stored anywhere module-level instead.
    const responses = await Promise.all([
      request(app).get('/health'),
      request(app).get('/health'),
      request(app).get('/health'),
    ]);

    const ids = responses.map((r) => r.headers['x-request-id']);
    expect(new Set(ids).size).toBe(3);
  });
});
