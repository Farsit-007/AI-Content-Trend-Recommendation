jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';
import { mockEmbedding } from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('Brand voice examples — super_admin access', () => {
  it('lets a super_admin create, list, and delete examples for a team it has no membership in', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-bve-super@example.test' });
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-bve@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const token = createAuthToken(superAdmin);
    mockEmbedding();

    const createRes = await request(app)
      .post('/api/v1/brand-voice-examples')
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team._id.toString(), platform: 'facebook', content: 'Just shipped our new dashboard!' });
    expect(createRes.status).toBe(201);
    const exampleId = createRes.body.data._id;

    const listRes = await request(app)
      .get(`/api/v1/brand-voice-examples?team_id=${team._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const deleteRes = await request(app)
      .delete(`/api/v1/brand-voice-examples/${exampleId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
  });
});
