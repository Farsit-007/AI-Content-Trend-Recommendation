jest.mock('../app/lib/openrouterClient');

const mockOpenAIEmbeddingsCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    embeddings: { create: mockOpenAIEmbeddingsCreate },
  }));
});

import { encrypt } from '../app/lib/crypto';
import { getOrEmbedTopic } from '../app/modules/ContentGeneration/contentGeneration.embedCache';
import { LlmModel, LlmProvider } from '../app/modules/LlmProvider/llmProvider.model';
import { Team } from '../app/modules/Team/team.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createTestTeam } from './support/fixtures';
import { getOpenRouterCallCounts, mockEmbedding } from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(() => {
  mockOpenAIEmbeddingsCreate.mockReset();
  return clearTestDb();
});
afterAll(disconnectTestDb);

/** A real, active LlmProvider(openrouter) with one active key and one active embedding-capable model. */
const createConfiguredEmbeddingModel = async (modelId: string) => {
  const provider = await LlmProvider.create({ provider_type: 'openrouter', name: 'Configured OpenRouter', is_active: true });
  provider.keys.push({
    encrypted_key: encrypt('real-configured-key'),
    key_last4: '9999',
    is_active: true,
    created_at: new Date(),
  } as never);
  await provider.save();
  const model = await LlmModel.create({
    provider_id: provider._id,
    model_id: modelId,
    display_name: 'Configured Embedding Model',
    capabilities: ['embedding'],
    is_active: true,
  });
  return model;
};

describe('getOrEmbedTopic', () => {
  it('a second call for the same topic and team does not hit the embedding provider', async () => {
    const team = await createTestTeam();
    mockEmbedding();

    const first = await getOrEmbedTopic('a unique topic for cache-hit test', team._id.toString());
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);

    const second = await getOrEmbedTopic('a unique topic for cache-hit test', team._id.toString());
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);
    expect(second).toEqual(first);
  });

  it('a resolved-model change for the same topic causes a fresh embed rather than serving a stale vector', async () => {
    const teamA = await createTestTeam({ name: 'Team A' });
    const teamB = await createTestTeam({ name: 'Team B' });
    const topic = 'a unique topic for model-change test';

    mockEmbedding(Array(1536).fill(0.02));
    await getOrEmbedTopic(topic, teamA._id.toString());
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);

    // teamB resolves through a different, explicitly-configured embedding model — a different
    // resolved model id must not reuse teamA's cached vector for the identical topic text.
    const model = await createConfiguredEmbeddingModel('openrouter/different-embedding-model');
    await Team.findByIdAndUpdate(teamB._id, { default_models: { embedding: model._id.toString() } });
    mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: Array(1536).fill(0.05) }] });

    await getOrEmbedTopic(topic, teamB._id.toString());
    // teamA's call went through the bootstrap mock (embeddingCalls counter); teamB's went through
    // the configured adapter's own mock — both firing confirms neither served the other's cache entry.
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);
    expect(mockOpenAIEmbeddingsCreate).toHaveBeenCalledTimes(1);
  });
});
