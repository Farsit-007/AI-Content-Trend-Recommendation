jest.mock('../app/lib/openrouterClient');

import request from 'supertest';
import app from '../app';
import config from '../app/config';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestTeam, createTestUser } from './support/fixtures';
import {
  getOpenRouterCallCounts,
  mockChatCompletion,
  mockChatCompletionSequence,
  mockEmbedding,
  mockEmbeddingBatch,
} from './support/openrouterMock';
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

  // Only super_admin may mutate packs (requireSuperAdmin on every write route). This asserts the
  // negative case for a regular user — the sole non-super_admin tier that exists now that the middle
  // `admin` role has been removed. It previously looped over an `admin` actor too, but that actor was
  // mechanically rewritten to `role: 'super_admin'` when the role was dropped, which inverted the
  // test: it asserted a super_admin gets 403 on routes super_admins are explicitly allowed to call.
  it('rejects regular users from mutating packs and examples', async () => {
    const user = await createTestUser({ email: 'user-stylepack-mutate@example.test' });
    const pack = await createPackDoc();

    for (const requester of [user]) {
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
    // A regular user, not a second super_admin: `include_inactive` is honoured for super_admins, so
    // the negative half of "only for super_admin" has to be asserted with someone who isn't one.
    const regularUser = await createTestUser({ email: 'user-stylepack-inactive@example.test' });
    const inactivePack = await createPackDoc({ is_active: false });

    const superAdminRes = await request(app)
      .get('/api/v1/style-packs?include_inactive=true')
      .set('Authorization', `Bearer ${createAuthToken(superAdmin)}`);
    expect(superAdminRes.body.data.some((p: { _id: string }) => p._id === inactivePack._id.toString())).toBe(true);

    const regularRes = await request(app)
      .get('/api/v1/style-packs?include_inactive=true')
      .set('Authorization', `Bearer ${createAuthToken(regularUser)}`);
    expect(regularRes.body.data.some((p: { _id: string }) => p._id === inactivePack._id.toString())).toBe(false);
  });
});

describe('Team default_style_pack_id', () => {
  it('stores and clears the field via team PATCH', async () => {
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-team-stylepack@example.test' });
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
    const admin = await createTestUser({ role: 'super_admin', email: 'admin-team-stylepack-dangling@example.test' });
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

describe('Bulk example import', () => {
  it('imports a mixed batch, skipping normalized duplicates against existing examples and within the batch, in one embeddings call', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-bulk-1@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbeddingBatch();

    // Pre-existing example whose whitespace-normalized content will collide with a batch item.
    await StyleExample.create({
      style_pack_id: pack._id.toString(),
      content: 'Already stored post',
      embedding: Array(1536).fill(0.01),
    });

    const items = [
      { content: 'Already   stored   post' }, // dup of the existing example (normalized)
      { content: 'Brand new post one' },
      { content: 'Brand new post two' },
      { content: 'Brand new post two' }, // dup within the batch (exact)
      { content: '  Brand new post three  ' },
    ];

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ created: 3, skipped: 2, total: 4 });
    expect(await StyleExample.countDocuments({ style_pack_id: pack._id.toString() })).toBe(4);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);
  });

  it('is idempotent — re-importing the same batch skips everything and creates nothing', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-bulk-2@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbeddingBatch();

    const items = [{ content: 'Repeatable post one' }, { content: 'Repeatable post two' }];

    const firstRes = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items });
    expect(firstRes.body.data).toEqual({ created: 2, skipped: 0, total: 2 });

    const secondRes = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items });
    expect(secondRes.status).toBe(201);
    expect(secondRes.body.data).toEqual({ created: 0, skipped: 2, total: 2 });
    expect(await StyleExample.countDocuments({ style_pack_id: pack._id.toString() })).toBe(2);
  });

  it('rejects a batch of 101 items and creates nothing', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-bulk-3@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbeddingBatch();

    const items = Array.from({ length: 101 }, (_, i) => ({ content: `Post number ${i}` }));

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items });

    expect(res.status).toBe(400);
    expect(await StyleExample.countDocuments({ style_pack_id: pack._id.toString() })).toBe(0);
  });

  it('rejects a batch containing an item with invalid shape and creates nothing', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-bulk-4@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbeddingBatch();

    const items = [{ content: 'A valid post' }, { content: '' }]; // second item fails min(1)

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items });

    expect(res.status).toBe(400);
    expect(await StyleExample.countDocuments({ style_pack_id: pack._id.toString() })).toBe(0);
  });

  it('rejects regular users', async () => {
    const user = await createTestUser({ email: 'user-stylepack-bulk@example.test' });
    const pack = await createPackDoc();

    for (const requester of [user]) {
      const res = await request(app)
        .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
        .set('Authorization', `Bearer ${createAuthToken(requester)}`)
        .send({ items: [{ content: 'attempted bulk item' }] });
      expect(res.status).toBe(403);
    }
  });
});

describe('Style card generation', () => {
  it('generates a card and stamps freshness metadata', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-card-1@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbedding();
    mockChatCompletion('This style writes with an energetic, motivational tone...');

    await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'একটা উদাহরণ পোস্ট' });
    await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'আরেকটা উদাহরণ পোস্ট' });

    const genRes = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/generate-card`)
      .set('Authorization', `Bearer ${token}`);
    expect(genRes.status).toBe(200);
    expect(genRes.body.data.style_card).toContain('energetic');

    const detailRes = await request(app)
      .get(`/api/v1/style-packs/${pack._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.body.data.style_card_example_count).toBe(2);
    expect(detailRes.body.data.style_card_generated_at).toBeTruthy();
  });

  it('overwrites prior card metadata on regeneration', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-card-2@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbedding();

    await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'প্রথম পোস্ট' });

    mockChatCompletion('First card version');
    const firstGen = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/generate-card`)
      .set('Authorization', `Bearer ${token}`);
    expect(firstGen.body.data.style_card).toBe('First card version');

    await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'দ্বিতীয় পোস্ট' });

    mockChatCompletion('Second card version');
    const secondGen = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/generate-card`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondGen.body.data.style_card).toBe('Second card version');

    const detailRes = await request(app)
      .get(`/api/v1/style-packs/${pack._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.body.data.style_card).toBe('Second card version');
    expect(detailRes.body.data.style_card_example_count).toBe(2);
  });

  it('rejects generating a card for an empty pack and leaves it unchanged', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-card-3@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/generate-card`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);

    const stored = await StylePack.findById(pack._id);
    expect(stored?.style_card).toBeUndefined();
  });

  it('rejects regular users', async () => {
    const user = await createTestUser({ email: 'user-stylepack-card@example.test' });
    const pack = await createPackDoc();

    for (const requester of [user]) {
      const res = await request(app)
        .post(`/api/v1/style-packs/${pack._id}/generate-card`)
        .set('Authorization', `Bearer ${createAuthToken(requester)}`);
      expect(res.status).toBe(403);
    }
  });
});

describe('Topic-summary embedding strategy (style-example-topic-summary-embeddings)', () => {
  const originalFlag = config.style_packs.embed_examples_by_topic_summary;
  afterEach(() => {
    config.style_packs.embed_examples_by_topic_summary = originalFlag;
  });

  it('flag off (default): single add embeds raw content, byte-identical to pre-change behavior', async () => {
    config.style_packs.embed_examples_by_topic_summary = false;
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-embed-off@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockEmbedding();

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'একটা Bangla example post' });

    expect(res.status).toBe(201);
    expect(res.body.data.embedding_source).toBe('content');
    expect(res.body.data.topic_summary).toBeUndefined();
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
  });

  it('flag on: single add extracts a topic summary and embeds it', async () => {
    config.style_packs.embed_examples_by_topic_summary = true;
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-embed-on@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockChatCompletion('A motivational post encouraging beginners to start coding.');
    mockEmbedding();

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'একটা Bangla example post' });

    expect(res.status).toBe(201);
    expect(res.body.data.embedding_source).toBe('topic_summary');
    expect(res.body.data.topic_summary).toBe('A motivational post encouraging beginners to start coding.');
  });

  it('flag on: bulk import tags each created example with its own embedding_source', async () => {
    config.style_packs.embed_examples_by_topic_summary = true;
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-stylepack-embed-bulk@example.test' });
    const token = createAuthToken(superAdmin);
    const pack = await createPackDoc();
    mockChatCompletionSequence(['Summary one.', 'Summary two.']);
    mockEmbeddingBatch();

    const res = await request(app)
      .post(`/api/v1/style-packs/${pack._id}/examples/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ content: 'bulk item one' }, { content: 'bulk item two' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);

    const stored = await StyleExample.find({ style_pack_id: pack._id.toString() }).sort('content');
    expect(stored.every((e) => e.embedding_source === 'topic_summary')).toBe(true);
  });
});
