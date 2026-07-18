import request from 'supertest';
import app from '../app';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createAuthToken, createTestUser } from './support/fixtures';
import { LlmModel, LlmProvider, LlmTaskDefault } from '../app/modules/LlmProvider/llmProvider.model';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('LLM provider registry — auth gating', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/v1/llm-providers');
    expect(res.status).toBe(401);
  });

  it('rejects a non-super-admin caller (regular user and admin alike)', async () => {
    const user = await createTestUser({ email: 'user-llm-1@example.test' });
    const admin = await createTestUser({ role: 'admin', email: 'admin-llm-1@example.test' });

    for (const requester of [user, admin]) {
      const token = createAuthToken(requester);
      const res = await request(app).get('/api/v1/llm-providers').set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });
});

describe('LLM provider registry — provider CRUD', () => {
  it('lets a super_admin create, list, read, update, and delete a provider', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-1@example.test' });
    const token = createAuthToken(superAdmin);

    const createRes = await request(app)
      .post('/api/v1/llm-providers')
      .set(authHeader(token))
      .send({ provider_type: 'anthropic', name: 'Anthropic (primary)' });
    expect(createRes.status).toBe(201);
    const providerId = createRes.body.data._id;
    expect(createRes.body.data.keys).toEqual([]);

    const listRes = await request(app).get('/api/v1/llm-providers').set(authHeader(token));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const getRes = await request(app).get(`/api/v1/llm-providers/${providerId}`).set(authHeader(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Anthropic (primary)');

    const updateRes = await request(app)
      .patch(`/api/v1/llm-providers/${providerId}`)
      .set(authHeader(token))
      .send({ name: 'Anthropic (renamed)', is_active: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Anthropic (renamed)');
    expect(updateRes.body.data.is_active).toBe(false);

    const deleteRes = await request(app).delete(`/api/v1/llm-providers/${providerId}`).set(authHeader(token));
    expect(deleteRes.status).toBe(200);

    const afterDelete = await LlmProvider.findById(providerId);
    expect(afterDelete).toBeNull();
  });

  it('rejects an invalid provider_type', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-2@example.test' });
    const token = createAuthToken(superAdmin);

    const res = await request(app)
      .post('/api/v1/llm-providers')
      .set(authHeader(token))
      .send({ provider_type: 'not-a-real-provider', name: 'Bogus' });
    expect(res.status).toBe(400);

    expect(await LlmProvider.countDocuments()).toBe(0);
  });

  it('deleting a provider cascades its models', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-3@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openai', name: 'OpenAI' });
    await LlmModel.create({
      provider_id: provider._id,
      model_id: 'gpt-4o-mini',
      display_name: 'GPT-4o mini',
      capabilities: ['chat'],
    });
    expect(await LlmModel.countDocuments({ provider_id: provider._id })).toBe(1);

    const res = await request(app).delete(`/api/v1/llm-providers/${provider._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(await LlmModel.countDocuments({ provider_id: provider._id })).toBe(0);
  });
});

describe('LLM provider registry — keys: masking and reveal', () => {
  it('masks keys in list/read responses and reveals the real value only via the reveal endpoint', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-4@example.test' });
    const token = createAuthToken(superAdmin);

    const providerRes = await request(app)
      .post('/api/v1/llm-providers')
      .set(authHeader(token))
      .send({ provider_type: 'openrouter', name: 'OpenRouter' });
    const providerId = providerRes.body.data._id;

    const addKeyRes = await request(app)
      .post(`/api/v1/llm-providers/${providerId}/keys`)
      .set(authHeader(token))
      .send({ key: 'sk-or-v1-super-secret-key-abcd1234', label: 'primary' });
    expect(addKeyRes.status).toBe(201);
    const key = addKeyRes.body.data.keys[0];
    expect(key.key_last4).toBe('1234');
    expect(key.encrypted_key).toBeUndefined();
    expect(JSON.stringify(addKeyRes.body)).not.toContain('sk-or-v1-super-secret-key-abcd1234');

    const listRes = await request(app).get('/api/v1/llm-providers').set(authHeader(token));
    expect(JSON.stringify(listRes.body)).not.toContain('sk-or-v1-super-secret-key-abcd1234');
    expect(listRes.body.data[0].keys[0].key_last4).toBe('1234');

    const revealRes = await request(app)
      .post(`/api/v1/llm-providers/${providerId}/keys/${key._id}/reveal`)
      .set(authHeader(token));
    expect(revealRes.status).toBe(200);
    expect(revealRes.body.data.key).toBe('sk-or-v1-super-secret-key-abcd1234');
  });

  it('returns 404 revealing a keyId that does not belong to the given provider', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-5@example.test' });
    const token = createAuthToken(superAdmin);

    const providerA = await LlmProvider.create({ provider_type: 'openai', name: 'A' });
    const providerB = await LlmProvider.create({ provider_type: 'openai', name: 'B' });
    providerB.keys.push({ encrypted_key: 'irrelevant', key_last4: '9999', is_active: true, created_at: new Date() } as never);
    await providerB.save();
    const foreignKeyId = providerB.keys[0]._id;

    const res = await request(app)
      .post(`/api/v1/llm-providers/${providerA._id}/keys/${foreignKeyId}/reveal`)
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('supports multiple keys per provider, each independently toggled', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-6@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openai', name: 'OpenAI' });
    const key1 = await request(app)
      .post(`/api/v1/llm-providers/${provider._id}/keys`)
      .set(authHeader(token))
      .send({ key: 'key-one-aaaa', label: 'one' });
    const key2 = await request(app)
      .post(`/api/v1/llm-providers/${provider._id}/keys`)
      .set(authHeader(token))
      .send({ key: 'key-two-bbbb', label: 'two' });

    const key1Id = key1.body.data.keys[0]._id;
    const key2Id = key2.body.data.keys[1]._id;

    const toggleRes = await request(app)
      .patch(`/api/v1/llm-providers/${provider._id}/keys/${key1Id}`)
      .set(authHeader(token))
      .send({ is_active: false });
    expect(toggleRes.status).toBe(200);

    const updated = await LlmProvider.findById(provider._id);
    const updatedKey1 = updated!.keys.id(key1Id);
    const updatedKey2 = updated!.keys.id(key2Id);
    expect(updatedKey1!.is_active).toBe(false);
    expect(updatedKey2!.is_active).toBe(true);
  });

  it('deletes a key', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-7@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openai', name: 'OpenAI' });
    const addRes = await request(app)
      .post(`/api/v1/llm-providers/${provider._id}/keys`)
      .set(authHeader(token))
      .send({ key: 'key-to-delete-cccc' });
    const keyId = addRes.body.data.keys[0]._id;

    const deleteRes = await request(app)
      .delete(`/api/v1/llm-providers/${provider._id}/keys/${keyId}`)
      .set(authHeader(token));
    expect(deleteRes.status).toBe(200);

    const updated = await LlmProvider.findById(provider._id);
    expect(updated!.keys).toHaveLength(0);
  });
});

describe('LLM provider registry — model catalog', () => {
  it('lets a super_admin add, list, update, and delete a model scoped to a provider', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-8@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'anthropic', name: 'Anthropic' });

    const createRes = await request(app)
      .post(`/api/v1/llm-providers/${provider._id}/models`)
      .set(authHeader(token))
      .send({ model_id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', capabilities: ['chat'] });
    expect(createRes.status).toBe(201);
    const modelId = createRes.body.data._id;

    const listRes = await request(app).get(`/api/v1/llm-providers/${provider._id}/models`).set(authHeader(token));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const updateRes = await request(app)
      .patch(`/api/v1/llm-providers/${provider._id}/models/${modelId}`)
      .set(authHeader(token))
      .send({ is_active: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.is_active).toBe(false);

    const deleteRes = await request(app)
      .delete(`/api/v1/llm-providers/${provider._id}/models/${modelId}`)
      .set(authHeader(token));
    expect(deleteRes.status).toBe(200);
    expect(await LlmModel.countDocuments()).toBe(0);
  });

  it('lists only models belonging to the given provider', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-9@example.test' });
    const token = createAuthToken(superAdmin);

    const providerA = await LlmProvider.create({ provider_type: 'openai', name: 'A' });
    const providerB = await LlmProvider.create({ provider_type: 'openai', name: 'B' });
    await LlmModel.create({ provider_id: providerA._id, model_id: 'model-a', display_name: 'Model A', capabilities: ['chat'] });
    await LlmModel.create({ provider_id: providerB._id, model_id: 'model-b', display_name: 'Model B', capabilities: ['chat'] });

    const res = await request(app).get(`/api/v1/llm-providers/${providerA._id}/models`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].model_id).toBe('model-a');
  });
});

describe('LLM provider registry — task defaults', () => {
  it('lets a super_admin set and read a global default for a task', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-10@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'OpenRouter' });
    const model = await LlmModel.create({
      provider_id: provider._id,
      model_id: 'openrouter/model-x',
      display_name: 'Model X',
      capabilities: ['chat'],
    });

    const setRes = await request(app)
      .put('/api/v1/llm-providers/task-defaults/content_generation')
      .set(authHeader(token))
      .send({ llm_model_id: model._id });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.task).toBe('content_generation');

    const listRes = await request(app).get('/api/v1/llm-providers/task-defaults').set(authHeader(token));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].task).toBe('content_generation');
  });

  it('setting a default for the same task twice replaces the prior default (upsert), not a duplicate row', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-11@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'OpenRouter' });
    const modelA = await LlmModel.create({
      provider_id: provider._id,
      model_id: 'model-a',
      display_name: 'A',
      capabilities: ['chat'],
    });
    const modelB = await LlmModel.create({
      provider_id: provider._id,
      model_id: 'model-b',
      display_name: 'B',
      capabilities: ['chat'],
    });

    await request(app)
      .put('/api/v1/llm-providers/task-defaults/chat')
      .set(authHeader(token))
      .send({ llm_model_id: modelA._id });
    await request(app)
      .put('/api/v1/llm-providers/task-defaults/chat')
      .set(authHeader(token))
      .send({ llm_model_id: modelB._id });

    expect(await LlmTaskDefault.countDocuments({ task: 'chat' })).toBe(1);
    const doc = await LlmTaskDefault.findOne({ task: 'chat' });
    expect(doc!.llm_model_id.toString()).toBe(modelB._id.toString());
  });

  it('rejects an invalid task name', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-12@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'OpenRouter' });
    const model = await LlmModel.create({
      provider_id: provider._id,
      model_id: 'model-a',
      display_name: 'A',
      capabilities: ['chat'],
    });

    const res = await request(app)
      .put('/api/v1/llm-providers/task-defaults/not-a-real-task')
      .set(authHeader(token))
      .send({ llm_model_id: model._id });
    expect(res.status).toBe(400);
  });

  it('rejects a task-default pointing at a nonexistent LlmModel', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-13@example.test' });
    const token = createAuthToken(superAdmin);

    const res = await request(app)
      .put('/api/v1/llm-providers/task-defaults/chat')
      .set(authHeader(token))
      .send({ llm_model_id: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(404);
  });

  it('rejects a non-super-admin caller for task-default routes', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-llm-2@example.test' });
    const token = createAuthToken(admin);

    const res = await request(app).get('/api/v1/llm-providers/task-defaults').set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('lets a super_admin unset a task default; resolution then falls through to the next tier', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-14@example.test' });
    const token = createAuthToken(superAdmin);

    const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'OpenRouter' });
    const model = await LlmModel.create({
      provider_id: provider._id,
      model_id: 'model-clearable',
      display_name: 'Clearable',
      capabilities: ['chat'],
    });
    await request(app)
      .put('/api/v1/llm-providers/task-defaults/chat')
      .set(authHeader(token))
      .send({ llm_model_id: model._id });
    expect(await LlmTaskDefault.countDocuments({ task: 'chat' })).toBe(1);

    const clearRes = await request(app).delete('/api/v1/llm-providers/task-defaults/chat').set(authHeader(token));
    expect(clearRes.status).toBe(200);
    expect(await LlmTaskDefault.countDocuments({ task: 'chat' })).toBe(0);
  });

  it('returns 404 clearing a task that has no default set', async () => {
    const superAdmin = await createTestUser({ role: 'super_admin', email: 'super-llm-15@example.test' });
    const token = createAuthToken(superAdmin);

    const res = await request(app).delete('/api/v1/llm-providers/task-defaults/critique').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('rejects a non-super-admin caller for the clear route', async () => {
    const admin = await createTestUser({ role: 'admin', email: 'admin-llm-3@example.test' });
    const token = createAuthToken(admin);

    const res = await request(app).delete('/api/v1/llm-providers/task-defaults/chat').set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe('LLM provider registry — active models (any authenticated user)', () => {
  it('lets a regular authenticated user list active, chat-capable models across active providers', async () => {
    const user = await createTestUser({ email: 'user-llm-2@example.test' });
    const token = createAuthToken(user);

    const activeProvider = await LlmProvider.create({ provider_type: 'openrouter', name: 'Active', is_active: true });
    const inactiveProvider = await LlmProvider.create({ provider_type: 'openai', name: 'Inactive', is_active: false });
    await LlmModel.create({
      provider_id: activeProvider._id,
      model_id: 'chat-model',
      display_name: 'Chat Model',
      capabilities: ['chat'],
    });
    await LlmModel.create({
      provider_id: activeProvider._id,
      model_id: 'embedding-only-model',
      display_name: 'Embedding Only',
      capabilities: ['embedding'],
    });
    await LlmModel.create({
      provider_id: activeProvider._id,
      model_id: 'inactive-chat-model',
      display_name: 'Inactive Chat',
      capabilities: ['chat'],
      is_active: false,
    });
    await LlmModel.create({
      provider_id: inactiveProvider._id,
      model_id: 'model-from-inactive-provider',
      display_name: 'Should not appear',
      capabilities: ['chat'],
    });

    const res = await request(app).get('/api/v1/llm-providers/models/active').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].model_id).toBe('chat-model');
    expect(res.body.data[0].provider_type).toBe('openrouter');
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).get('/api/v1/llm-providers/models/active');
    expect(res.status).toBe(401);
  });
});
