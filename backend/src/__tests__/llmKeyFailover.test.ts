/**
 * Multi-key failover: rotation, cooldown memory, error classification, and the attempt cap.
 *
 * These assert the properties that make holding several provider keys worth anything. Before this
 * behaviour existed, resolution always picked `keys[0]`, retried exactly once, retried on *any*
 * error, and remembered nothing — so a third key was unreachable, a rate-limited key was re-tried
 * on every subsequent request, and a malformed request burned two billable calls instead of one.
 */

const openAiConstructorCalls: { apiKey: string }[] = [];
const mockOpenAIChatCreate = jest.fn();
const mockOpenAIEmbeddingsCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation((opts: { apiKey: string }) => {
    // Recording the constructor arg is how these tests observe *which key* served a call — the
    // adapter builds a fresh client per call, bound to one decrypted key.
    openAiConstructorCalls.push(opts);
    return {
      chat: { completions: { create: mockOpenAIChatCreate } },
      embeddings: { create: mockOpenAIEmbeddingsCreate },
    };
  });
});

jest.mock('../app/lib/openrouterClient');

import config from '../app/config';
import { redis } from '../app/lib/redis';
import {
  chatCompletionForTask,
  streamChatCompletionForTask,
} from '../app/lib/modelResolution';
import {
  LlmModel,
  LlmProvider,
  LlmTaskDefault,
} from '../app/modules/LlmProvider/llmProvider.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';

beforeAll(connectTestDb);
afterEach(async () => {
  mockOpenAIChatCreate.mockReset();
  mockOpenAIEmbeddingsCreate.mockReset();
  openAiConstructorCalls.length = 0;
  // Cooldowns and the rotation counter live in Redis (ioredis-mock here) and would otherwise leak
  // between tests — a key cooled in one test would be skipped in the next.
  await redis.flushall();
  await clearTestDb();
});
afterAll(disconnectTestDb);

/** An error shaped like the one the OpenAI SDK throws: a `status`, plus optional headers. */
const apiError = (status: number, headers?: Record<string, string>) =>
  Object.assign(new Error(`provider returned ${status}`), { status, headers });

const keyPlaintext = (index: number) => `real-secret-key-${index}`;

/** One active openrouter provider with `keyCount` active keys, plus a chat model set as the global default. */
const seedPool = async (keyCount: number) => {
  const provider = await LlmProvider.create({
    provider_type: 'openrouter',
    name: 'Pooled Provider',
    is_active: true,
  });

  const { encrypt } = await import('../app/lib/crypto');
  for (let i = 0; i < keyCount; i += 1) {
    provider.keys.push({
      encrypted_key: encrypt(keyPlaintext(i)),
      key_last4: `000${i}`,
      is_active: true,
      created_at: new Date(),
    } as never);
  }
  await provider.save();

  const model = await LlmModel.create({
    provider_id: provider._id,
    model_id: 'test/pooled-model',
    display_name: 'Pooled Model',
    capabilities: ['chat'],
    is_active: true,
  });

  await LlmTaskDefault.create({ task: 'chat', llm_model_id: model._id });

  return { provider, model };
};

const okChat = () => ({ choices: [{ message: { content: 'ok' } }] });

/** The plaintext keys the adapter was constructed with, in call order. */
const keysUsed = () => openAiConstructorCalls.map((c) => c.apiKey);

describe('key rotation', () => {
  it('spreads consecutive requests across every key in the pool', async () => {
    await seedPool(3);
    mockOpenAIChatCreate.mockResolvedValue(okChat());

    await chatCompletionForTask('chat', [{ role: 'user', content: 'one' }]);
    await chatCompletionForTask('chat', [{ role: 'user', content: 'two' }]);
    await chatCompletionForTask('chat', [{ role: 'user', content: 'three' }]);

    // Three successful requests, three different keys — not the same key three times.
    expect(new Set(keysUsed()).size).toBe(3);
    expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(3);
  });
});

describe('rate-limit cooldown', () => {
  it('fails over on a 429 and then skips the cooled key on the next request', async () => {
    await seedPool(2);

    // First attempt of the first request is rate-limited; everything after succeeds.
    mockOpenAIChatCreate.mockRejectedValueOnce(
      apiError(429, { 'retry-after': '30' }),
    );
    mockOpenAIChatCreate.mockResolvedValue(okChat());

    const first = await chatCompletionForTask('chat', [
      { role: 'user', content: 'first' },
    ]);
    expect(first).toBe('ok');

    const limitedKey = keysUsed()[0];
    const survivingKey = keysUsed()[1];
    expect(limitedKey).not.toBe(survivingKey);

    openAiConstructorCalls.length = 0;
    mockOpenAIChatCreate.mockClear();

    // The cooled key must not be tried at all on the next request — the whole point is not paying
    // the same rejection twice.
    await chatCompletionForTask('chat', [{ role: 'user', content: 'second' }]);
    await chatCompletionForTask('chat', [{ role: 'user', content: 'third' }]);

    expect(keysUsed()).not.toContain(limitedKey);
    expect(new Set(keysUsed())).toEqual(new Set([survivingKey]));
  });

  it('honours Retry-After, so a key with a short cooldown returns to rotation', async () => {
    await seedPool(2);
    // 1s is the shortest cooldown the classifier will honour — it floors anything smaller, since a
    // sub-second rest does not meaningfully protect a rate-limited key.
    mockOpenAIChatCreate.mockRejectedValueOnce(
      apiError(429, { 'retry-after': '1' }),
    );
    mockOpenAIChatCreate.mockResolvedValue(okChat());

    await chatCompletionForTask('chat', [{ role: 'user', content: 'first' }]);
    const limitedKey = keysUsed()[0];

    await new Promise((resolve) => setTimeout(resolve, 1200));

    openAiConstructorCalls.length = 0;
    // Two requests over a 2-key pool: rotation reaches both, so the recovered key must reappear.
    await chatCompletionForTask('chat', [{ role: 'user', content: 'after' }]);
    await chatCompletionForTask('chat', [
      { role: 'user', content: 'after again' },
    ]);

    expect(keysUsed()).toContain(limitedKey);
  });

  it('still attempts a cooled key rather than failing outright when every key is resting', async () => {
    await seedPool(2);
    mockOpenAIChatCreate.mockRejectedValueOnce(apiError(429));
    mockOpenAIChatCreate.mockRejectedValueOnce(apiError(429));
    // Both keys are now cooling. A pool that is entirely rested must degrade to "try anyway",
    // not to a hard outage.
    await expect(
      chatCompletionForTask('chat', [{ role: 'user', content: 'x' }]),
    ).rejects.toThrow();

    openAiConstructorCalls.length = 0;
    mockOpenAIChatCreate.mockReset();
    mockOpenAIChatCreate.mockResolvedValue(okChat());

    const result = await chatCompletionForTask('chat', [
      { role: 'user', content: 'y' },
    ]);

    expect(result).toBe('ok');
    expect(mockOpenAIChatCreate).toHaveBeenCalled();
  });
});

describe('error classification', () => {
  it('does not burn a second key on a permanent error', async () => {
    await seedPool(3);
    // 400 means the request itself is wrong (bad model id, malformed body) — it fails identically
    // on every key, so retrying only buys another billable call.
    mockOpenAIChatCreate.mockRejectedValue(apiError(400));

    await expect(
      chatCompletionForTask('chat', [{ role: 'user', content: 'x' }]),
    ).rejects.toThrow();

    expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
  });

  it('leaves a key in rotation after a provider-side 5xx', async () => {
    await seedPool(2);
    mockOpenAIChatCreate.mockRejectedValueOnce(apiError(503));
    mockOpenAIChatCreate.mockResolvedValue(okChat());

    await chatCompletionForTask('chat', [{ role: 'user', content: 'x' }]);
    const failedKey = keysUsed()[0];

    openAiConstructorCalls.length = 0;
    await chatCompletionForTask('chat', [{ role: 'user', content: 'y' }]);
    await chatCompletionForTask('chat', [{ role: 'user', content: 'z' }]);

    // The provider was struggling, not the key — so it must not have been penalised.
    expect(keysUsed()).toContain(failedKey);
  });
});

describe('attempt cap', () => {
  it('never exceeds LLM_MAX_KEY_ATTEMPTS even with a larger pool', async () => {
    await seedPool(6);
    mockOpenAIChatCreate.mockRejectedValue(apiError(429));

    await expect(
      chatCompletionForTask('chat', [{ role: 'user', content: 'x' }]),
    ).rejects.toThrow();

    // Without a cap, one request against a 6-key pool would fan out into 6 paid calls.
    expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(
      config.llm.max_key_attempts,
    );
  });
});

describe('streaming', () => {
  /** An async iterable of chunks in the shape the adapter destructures. */
  const chunkStream = async function* (texts: string[]) {
    for (const text of texts) {
      yield { choices: [{ delta: { content: text } }] };
    }
  };

  it('fails over to another key when the stream cannot be opened', async () => {
    await seedPool(2);
    mockOpenAIChatCreate.mockRejectedValueOnce(apiError(429));
    mockOpenAIChatCreate.mockResolvedValueOnce(chunkStream(['he', 'llo']));

    const chunks: string[] = [];
    for await (const chunk of streamChatCompletionForTask('chat', [
      { role: 'user', content: 'x' },
    ])) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('hello');
    expect(new Set(keysUsed()).size).toBe(2);
  });

  it('surfaces a mid-stream failure instead of splicing a second completion into the answer', async () => {
    await seedPool(2);
    const dyingStream = async function* () {
      yield { choices: [{ delta: { content: 'partial' } }] };
      throw apiError(500);
    };
    mockOpenAIChatCreate.mockResolvedValueOnce(dyingStream());
    mockOpenAIChatCreate.mockResolvedValueOnce(
      chunkStream(['should never be used']),
    );

    const chunks: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of streamChatCompletionForTask('chat', [
          { role: 'user', content: 'x' },
        ])) {
          chunks.push(chunk);
        }
      })(),
    ).rejects.toThrow();

    // The caller keeps the partial answer and decides what it means; it is never continued on
    // another key, which would stitch two different completions together.
    expect(chunks).toEqual(['partial']);
    expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
  });
});
