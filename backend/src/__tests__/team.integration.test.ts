import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { addTeamMember, createAuthToken, createTestTeam, createTestUser } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('Team CRUD', () => {
  it('lets an admin create a team and add/remove a member', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-team-crud@example.test' });
    const member = await createTestUser({ email: 'member-to-add@example.test' });
    const adminToken = createAuthToken(admin);

    const createRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Growth Team' });
    expect(createRes.status).toBe(201);
    const teamId = createRes.body.data._id;

    const addRes = await request(app)
      .post(`/api/v1/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: member._id.toString() });
    expect(addRes.status).toBe(201);

    const getRes = await request(app)
      .get(`/api/v1/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.members).toContain(member._id.toString());

    const removeRes = await request(app)
      .delete(`/api/v1/teams/${teamId}/members/${member._id.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removeRes.status).toBe(200);
  });

  it('lets an admin update and delete a team', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-update-delete@example.test' });
    const adminToken = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });

    const updateRes = await request(app)
      .patch(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed Team' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Renamed Team');

    const deleteRes = await request(app)
      .delete(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
  });

  it('rejects a non-admin creating a team', async () => {
    const member = await createTestUser({ email: 'non-admin-create-team@example.test' });
    const token = createAuthToken(member);

    const res = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Should Not Be Created' });

    expect(res.status).toBe(403);
  });

  it('rejects a non-member fetching another team', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-owns-team@example.test' });
    const outsider = await createTestUser({ email: 'outsider-team@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const outsiderToken = createAuthToken(outsider);

    const res = await request(app)
      .get(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Team categories', () => {
  it('lets a team member add and remove a custom category', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-categories@example.test' });
    const member = await createTestUser({ email: 'member-categories@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), member._id.toString());
    const memberToken = createAuthToken(member);

    const addRes = await request(app)
      .post(`/api/v1/teams/${team._id}/categories`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ category: 'Robotics' });
    expect(addRes.status).toBe(201);
    expect(addRes.body.data.custom_categories).toContain('Robotics');

    const removeRes = await request(app)
      .delete(`/api/v1/teams/${team._id}/categories/Robotics`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(removeRes.status).toBe(200);
  });

  it('rejects a non-member accessing team categories', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-categories-2@example.test' });
    const outsider = await createTestUser({ email: 'outsider-categories@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const outsiderToken = createAuthToken(outsider);

    const res = await request(app)
      .get(`/api/v1/teams/${team._id}/categories`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });
});
