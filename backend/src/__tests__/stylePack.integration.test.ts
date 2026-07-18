jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';
import { mockEmbedding } from './support/openrouterMock';
import { StyleExample, StylePack } from '../app/modules/StylePack/stylePack.model';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const createPackDoc = (overrides: Partial<Record<string, unknown>> = {}) =>
  StylePack.create({
    name: 'Programming Hero',
    slug: `programming-hero-${Date.now()}-${Math.random()}`,
    language: 'bangla',
    tone_tags: ['energetic', 'edtech'],
    is_active: true,
    created_by: 'seed',
    ...overrides,
  });

describe('Style pack CRUD', () => {
  it('lets a super_admin create a pack and add an example with a 1536-dim embedding', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-1@example.test' });
    const token = createAuthToken(superAdmin);
    mockEmbedding();

    const createRes = await request(app)
      .post('/api/v1/style-packs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Programming Hero', slug: 'programming-hero-crud', language: 'bangla' });
    expect(createRes.status).toBe(201);
    const packId = createRes.body.data._id;

    const exampleRes = await request(app)
      .post(`/api/v1/style-packs/${packId}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'একটা Bangla example post', platform: 'facebook' });
    expect(exampleRes.status).toBe(201);
    expect(exampleRes.body.data.embedding).toHaveLength(1536);

    const detailRes = await request(app)
      .get(`/api/v1/style-packs/${packId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.example_count).toBe(1);
  });

  it('rejects admin and regular users from mutating packs and examples', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-stylepack-mutate@example.test' });
    const user = await createTestUser({ email: 'user-stylepack-mutate@example.test' });
    const pack = await createPackDoc();

    for (const requester of [admin, user]) {
      const token = createAuthToken(requester);

      const createRes = await request(app)
        .post('/api/v1/style-packs')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Should Fail', slug: `should-fail-${requester.email}`, language: 'bangla' });
      expect(createRes.status).toBe(403);

      const updateRes = await request(app)
        .patch(`/api/v1/style-packs/${pack._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ is_active: false });
      expect(updateRes.status).toBe(403);

      const exampleRes = await request(app)
        .post(`/api/v1/style-packs/${pack._id}/examples`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'attempted example' });
      expect(exampleRes.status).toBe(403);

      const deleteRes = await request(app)
        .delete(`/api/v1/style-packs/${pack._id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(403);
    }
  });

  it('lets any authenticated user list and read active packs', async () => {
    const user = await createTestUser({ email: 'user-stylepack-read@example.test' });
    const token = createAuthToken(user);
    const pack = await createPackDoc();

    const listRes = await request(app).get('/api/v1/style-packs').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p: { _id: string }) => p._id === pack._id.toString())).toBe(true);

    const detailRes = await request(app)
      .get(`/api/v1/style-packs/${pack._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.example_count).toBe(0);
  });
});

describe('Deleting a pack cascades to its examples', () => {
  it('removes every example belonging to a deleted pack', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-cascade@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbedding();

    await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'example to be cascaded away' });
    expect(await StyleExample.countDocuments({ style_pack_id: pack._id.toString() })).toBe(1);

    const deleteRes = await request(app)
      .delete(`/api/v1/style-packs/${pack._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    expect(await StyleExample.countDocuments({ style_pack_id: pack._id.toString() })).toBe(0);
  });
});

describe('include_inactive visibility', () => {
  it('excludes inactive packs from the default list for everyone', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-inactive-1@example.test' });
    const user = await createTestUser({ email: 'user-stylepack-inactive@example.test' });
    const inactivePack = await createPackDoc({ is_active: false });

    for (const requester of [superAdmin, user]) {
      const token = createAuthToken(requester);
      const res = await request(app).get('/api/v1/style-packs').set('Authorization', `Bearer ${token}`);
      expect(res.body.data.some((p: { _id: string }) => p._id === inactivePack._id.toString())).toBe(false);
    }
  });

  it('includes inactive packs only for super_admin with include_inactive=true', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-inactive-2@example.test' });
    const admin = await createTestUser({ role: 'admin', email: 'admin-stylepack-inactive@example.test' });
    const inactivePack = await createPackDoc({ is_active: false });

    const superAdminRes = await request(app)
      .get('/api/v1/style-packs?include_inactive=true')
      .set('Authorization', `Bearer ${createAuthToken(superAdmin)}`);
    expect(superAdminRes.body.data.some((p: { _id: string }) => p._id === inactivePack._id.toString())).toBe(true);

    const adminRes = await request(app)
      .get('/api/v1/style-packs?include_inactive=true')
      .set('Authorization', `Bearer ${createAuthToken(admin)}`);
    expect(adminRes.body.data.some((p: { _id: string }) => p._id === inactivePack._id.toString())).toBe(false);
  });
});

describe('Team default_style_pack_id', () => {
  it('stores and clears the field via team PATCH', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-team-stylepack@example.test' });
    const token = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const pack = await createPackDoc();

    const setRes = await request(app)
      .patch(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ default_style_pack_id: pack._id.toString() });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.default_style_pack_id).toBe(pack._id.toString());

    const clearRes = await request(app)
      .patch(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ default_style_pack_id: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.default_style_pack_id).toBeFalsy();
  });

  it('does not break a team read when default_style_pack_id points at a deleted pack', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-team-stylepack-dangling@example.test' });
    const token = createAuthToken(admin);
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    const pack = await createPackDoc();

    await request(app)
      .patch(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ default_style_pack_id: pack._id.toString() });
    await StylePack.findByIdAndDelete(pack._id);

    const getRes = await request(app)
      .get(`/api/v1/teams/${team._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.team.default_style_pack_id).toBe(pack._id.toString());
  });
});
