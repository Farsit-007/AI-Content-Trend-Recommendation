import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { addTeamMember, createAuthToken, createTestTeam, createTestUser, enablePlatformForTeam } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('Platform credentials', () => {
  it('lets a team member upsert, list, reveal, and delete a credential', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-credentials@example.test' });
    const member = await createTestUser({ email: 'member-credentials@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    await enablePlatformForTeam(team._id.toString(), 'facebook', admin._id.toString());
    const memberToken = createAuthToken(member);

    const upsertRes = await request(app)
      .post(`/api/v1/teams/${team._id}/credentials`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ platform: 'facebook', token: 'super-secret-token-1234' });
    expect(upsertRes.status).toBe(201);

    const listRes = await request(app)
      .get(`/api/v1/teams/${team._id}/credentials`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].token_last4).toBe('1234');

    const revealRes = await request(app)
      .get(`/api/v1/teams/${team._id}/credentials/facebook/reveal`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(revealRes.status).toBe(200);
    expect(revealRes.body.data.token).toBe('super-secret-token-1234');

    const deleteRes = await request(app)
      .delete(`/api/v1/teams/${team._id}/credentials/facebook`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(deleteRes.status).toBe(200);

    const revealAfterDeleteRes = await request(app)
      .get(`/api/v1/teams/${team._id}/credentials/facebook/reveal`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(revealAfterDeleteRes.status).toBe(404);
  });

  it('rejects an outsider listing, revealing, or deleting a team credential', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-credentials-2@example.test' });
    const outsider = await createTestUser({ email: 'outsider-credentials@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await enablePlatformForTeam(team._id.toString(), 'facebook', admin._id.toString());
    const outsiderToken = createAuthToken(outsider);

    const listRes = await request(app)
      .get(`/api/v1/teams/${team._id}/credentials`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(listRes.status).toBe(403);

    const revealRes = await request(app)
      .get(`/api/v1/teams/${team._id}/credentials/facebook/reveal`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(revealRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/teams/${team._id}/credentials/facebook`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(deleteRes.status).toBe(403);
  });
});
