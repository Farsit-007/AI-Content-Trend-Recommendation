import request from 'supertest';
import app from '../app';
import { encrypt } from '../app/lib/crypto';
import { redis } from '../app/lib/redis';
import { PlatformCredential } from '../app/modules/PlatformCredential/platformCredential.model';
import { AnalyticsRollup } from '../app/modules/Analytics/analytics.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';

// The immediate post-connect refresh is fire-and-forget; stub it so the suite never touches
// the (unmocked here) embeddings/OpenRouter path.
jest.mock('../app/modules/Analytics/analytics.service', () => ({
  runAnalyticsRefresh: jest.fn().mockResolvedValue({ success: true, teamsProcessed: 0, platformsProcessed: 0 }),
}));

const WEB = 'http://localhost:3000';

/** Minimal Response stand-in for the global fetch mock. */
const jsonResponse = (body: unknown, opts: { ok?: boolean; status?: number } = {}) => ({
  ok: opts.ok ?? true,
  status: opts.status ?? 200,
  headers: { get: () => null },
  json: async () => body,
});

type FetchRouter = (url: string, init?: RequestInit) => unknown;
let fetchRouter: FetchRouter;

beforeAll(connectTestDb);
afterEach(async () => {
  await clearTestDb();
  await redis.flushall();
  jest.restoreAllMocks();
});
afterAll(disconnectTestDb);

beforeEach(() => {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(fetchRouter(String(input), init)),
  ) as unknown as typeof fetch;
});

describe('MetaOAuth callback — state validation', () => {
  it('redirects with error=invalid_state for an unknown state', async () => {
    const res = await request(app).get('/api/v1/oauth/facebook/callback?code=abc&state=does-not-exist');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`${WEB}/dashboard/settings/platforms`);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('consumes the state single-use (reuse yields invalid_state)', async () => {
    const state = 'reuse-state-123';
    await redis.set(`oauth:fb:${state}`, JSON.stringify({ teamId: 't1', userId: 'u1' }));

    fetchRouter = (url) => {
      if (url.includes('/oauth/access_token') && url.includes('fb_exchange_token')) {
        return jsonResponse({ access_token: 'LONG' });
      }
      if (url.includes('/oauth/access_token')) return jsonResponse({ access_token: 'SHORT' });
      if (url.includes('/debug_token')) {
        return jsonResponse({ data: { is_valid: true, scopes: ['pages_show_list'] } });
      }
      return jsonResponse({});
    };

    // First use — state exists, then gets deleted (this path exits at missing_permissions).
    const first = await request(app).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
    expect(first.headers.location).toContain('error=missing_permissions');

    // Second use — state already consumed.
    const second = await request(app).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
    expect(second.headers.location).toContain('error=invalid_state');
  });

  it('redirects with missing_permissions when required scopes are absent', async () => {
    const state = 'scope-state';
    await redis.set(`oauth:fb:${state}`, JSON.stringify({ teamId: 't1', userId: 'u1' }));

    fetchRouter = (url) => {
      if (url.includes('fb_exchange_token')) return jsonResponse({ access_token: 'LONG' });
      if (url.includes('/oauth/access_token')) return jsonResponse({ access_token: 'SHORT' });
      if (url.includes('/debug_token')) {
        return jsonResponse({ data: { is_valid: true, scopes: ['pages_show_list', 'public_profile'] } });
      }
      return jsonResponse({ data: [] });
    };

    const res = await request(app).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
    expect(res.headers.location).toContain('error=missing_permissions');
    expect(res.headers.location).toContain('read_insights');
  });

  it('redirects with no_pages when the user administers no pages', async () => {
    const state = 'nopages-state';
    await redis.set(`oauth:fb:${state}`, JSON.stringify({ teamId: 't1', userId: 'u1' }));

    fetchRouter = (url) => {
      if (url.includes('fb_exchange_token')) return jsonResponse({ access_token: 'LONG' });
      if (url.includes('/oauth/access_token')) return jsonResponse({ access_token: 'SHORT' });
      if (url.includes('/debug_token')) {
        return jsonResponse({
          data: { is_valid: true, scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'] },
        });
      }
      if (url.includes('/me/accounts')) return jsonResponse({ data: [] });
      return jsonResponse({});
    };

    const res = await request(app).get(`/api/v1/oauth/facebook/callback?code=c&state=${state}`);
    expect(res.headers.location).toContain('error=no_pages');
  });
});

describe('MetaOAuth select-page', () => {
  it('persists encrypted facebook + instagram credentials from a pending candidate', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'meta-admin@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const teamId = team._id.toString();
    const token = createAuthToken(admin);

    const pageId = '100000000000001';
    const igId = '200000000000002';
    await redis.set(
      `oauth:fb:pending:${teamId}`,
      JSON.stringify([
        {
          id: pageId,
          name: 'Growth Studio Demo',
          encrypted_page_token: encrypt('PAGE-TOKEN-abcd'),
          ig_user_id: igId,
          ig_username: 'growth.demo',
          scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic'],
        },
      ]),
    );

    fetchRouter = (url) => {
      if (url.includes('/debug_token')) {
        return jsonResponse({ data: { is_valid: true, type: 'PAGE', profile_id: pageId } });
      }
      return jsonResponse({});
    };

    const res = await request(app)
      .post('/api/v1/oauth/facebook/select-page')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId, pageId });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ page: 'Growth Studio Demo', instagram: true });

    const fb = await PlatformCredential.findOne({ team_id: teamId, platform: 'facebook' }).select('+encrypted_token');
    expect(fb).not.toBeNull();
    expect(fb?.token_type).toBe('page');
    expect(fb?.page_id).toBe(pageId);
    expect(fb?.account_id).toBe(pageId);
    expect(fb?.encrypted_token).toBeTruthy();
    expect(fb?.encrypted_token).not.toContain('PAGE-TOKEN'); // stored encrypted, not plaintext

    const ig = await PlatformCredential.findOne({ team_id: teamId, platform: 'instagram' });
    expect(ig).not.toBeNull();
    expect(ig?.account_id).toBe(igId);
    expect(ig?.page_id).toBe(pageId);

    // Pending key consumed.
    expect(await redis.get(`oauth:fb:pending:${teamId}`)).toBeNull();
  });

  it('rejects a pageId that is not among the pending candidates', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'meta-admin2@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const teamId = team._id.toString();
    const token = createAuthToken(admin);

    await redis.set(
      `oauth:fb:pending:${teamId}`,
      JSON.stringify([{ id: 'real-page', name: 'X', encrypted_page_token: encrypt('t'), scopes: [] }]),
    );
    fetchRouter = () => jsonResponse({});

    const res = await request(app)
      .post('/api/v1/oauth/facebook/select-page')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId, pageId: 'not-a-candidate' });

    expect(res.status).toBe(400);
  });
});

describe('MetaOAuth disconnect', () => {
  it('revokes on Meta, deletes both credential rows, and writes not_connected rollups', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'meta-admin3@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const teamId = team._id.toString();
    const authToken = createAuthToken(admin);
    const pageId = '300000000000003';

    await PlatformCredential.create({
      team_id: teamId,
      platform: 'facebook',
      encrypted_token: encrypt('PAGE-TOKEN-xyz'),
      token_last4: 'xyz0',
      account_id: pageId,
      added_by: admin._id.toString(),
      token_type: 'page',
      page_id: pageId,
    });
    await PlatformCredential.create({
      team_id: teamId,
      platform: 'instagram',
      encrypted_token: encrypt('PAGE-TOKEN-xyz'),
      token_last4: 'xyz0',
      account_id: 'ig-1',
      added_by: admin._id.toString(),
      token_type: 'page',
      page_id: pageId,
    });

    const revokeCalls: string[] = [];
    fetchRouter = (url) => {
      revokeCalls.push(url);
      return jsonResponse({ success: true });
    };

    const res = await request(app)
      .delete(`/api/v1/oauth/facebook?teamId=${teamId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(revokeCalls.some((u) => u.includes(`/${pageId}/permissions`))).toBe(true);

    expect(await PlatformCredential.findOne({ team_id: teamId, platform: 'facebook' })).toBeNull();
    expect(await PlatformCredential.findOne({ team_id: teamId, platform: 'instagram' })).toBeNull();

    const fbRollup = await AnalyticsRollup.findOne({ team_id: teamId, platform: 'facebook' });
    expect(fbRollup?.status).toBe('not_connected');
  });

  it('forbids a non-member from disconnecting a team', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'meta-admin4@example.test' });
    const outsider = await createTestUser({ email: 'meta-outsider@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const outsiderToken = createAuthToken(outsider);
    fetchRouter = () => jsonResponse({});

    const res = await request(app)
      .delete(`/api/v1/oauth/facebook?teamId=${team._id}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});
