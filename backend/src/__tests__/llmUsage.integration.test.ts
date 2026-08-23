/**
 * The usage ledger — Phase 2.1.
 *
 * Every later token optimization is judged against these numbers, so the properties that matter are
 * not just "a row is written" but the ones that keep the ledger honest:
 *
 *  - a provider that reports no usage is recorded as `usage_reported: false`, never as zero tokens;
 *  - a model with no configured price contributes no cost, rather than an invented one;
 *  - a failed provider call is not billed to anyone;
 *  - a metering failure never turns a delivered answer into an error;
 *  - one team can never read another team's spend.
 */

const mockOpenAIChatCreate = jest.fn();
const mockOpenAIEmbeddingsCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAIChatCreate } },
    embeddings: { create: mockOpenAIEmbeddingsCreate },
  }));
});

jest.mock('../app/lib/openrouterClient');

import { Types } from 'mongoose';
import request from 'supertest';
import app from '../app';
import { redis } from '../app/lib/redis';
import {
  chatCompletionForTask,
  embedForTask,
} from '../app/lib/modelResolution';
import { encrypt } from '../app/lib/crypto';
import {
  LlmModel,
  LlmProvider,
  LlmTaskDefault,
} from '../app/modules/LlmProvider/llmProvider.model';
import {
  LlmUsageDaily,
  LlmUsageEvent,
} from '../app/modules/LlmUsage/llmUsage.model';
import {
  estimateCostUsd,
  flushLlmUsage,
  utcDateKey,
} from '../app/modules/LlmUsage/llmUsage.service';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import {
  addTeamMember,
  createAuthToken,
  createTestTeam,
  createTestUser,
} from './support/fixtures';

beforeAll(connectTestDb);
afterEach(async () => {
  mockOpenAIChatCreate.mockReset();
  mockOpenAIEmbeddingsCreate.mockReset();
  await redis.flushall();
  await clearTestDb();
});
afterAll(disconnectTestDb);

interface SeedOptions {
  inputCost?: number;
  outputCost?: number;
  capabilities?: ('chat' | 'embedding')[];
  task?: 'chat' | 'embedding';
}

/** One active openrouter provider + model, wired as the global default for `task`. */
const seedProvider = async (options: SeedOptions = {}) => {
  const provider = await LlmProvider.create({
    provider_type: 'openrouter',
    name: 'Metered Provider',
    is_active: true,
  });
  provider.keys.push({
    encrypted_key: encrypt('real-secret-key'),
    key_last4: '0001',
    is_active: true,
    created_at: new Date(),
  } as never);
  await provider.save();

  const model = await LlmModel.create({
    provider_id: provider._id,
    model_id: 'test/metered-model',
    display_name: 'Metered Model',
    capabilities: options.capabilities ?? ['chat'],
    is_active: true,
    input_cost_per_1m_usd: options.inputCost,
    output_cost_per_1m_usd: options.outputCost,
  });

  await LlmTaskDefault.create({
    task: options.task ?? 'chat',
    llm_model_id: model._id,
  });
  return { provider, model };
};

/**
 * Real ObjectId strings, not readable labels: model resolution does `Team.findById(teamId)` to look
 * for a per-team model override, and Mongoose rejects a non-ObjectId before metering is ever reached.
 */
const TEAM_A = new Types.ObjectId().toString();
const TEAM_B = new Types.ObjectId().toString();

const okChat = (usage?: Record<string, unknown>) => ({
  choices: [{ message: { content: 'ok' } }],
  ...(usage ? { usage } : {}),
});

describe('estimateCostUsd', () => {
  it('prices input and output separately, per 1M tokens', () => {
    const cost = estimateCostUsd(
      { prompt_tokens: 1_000_000, completion_tokens: 500_000 },
      0.15,
      0.6,
    );
    expect(cost).toBeCloseTo(0.15 + 0.3, 10);
  });

  it('returns undefined when the model carries no pricing — unpriced is not free', () => {
    expect(
      estimateCostUsd({ prompt_tokens: 1000, completion_tokens: 100 }),
    ).toBeUndefined();
  });

  it('returns undefined when the provider reported no usage', () => {
    expect(estimateCostUsd(undefined, 0.15, 0.6)).toBeUndefined();
  });

  it('does not discount cached tokens, so the estimate stays a defensible ceiling', () => {
    // Every provider prices cache reads differently; applying a guessed ratio would make the
    // number confidently wrong. `cached_prompt_tokens` is stored separately for the real saving.
    const withCache = estimateCostUsd(
      {
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        cached_prompt_tokens: 900_000,
      },
      0.15,
    );
    expect(withCache).toBeCloseTo(0.15, 10);
  });
});

describe('recording a chat completion', () => {
  it('writes an event row and a daily rollup with the provider-reported tokens and cost', async () => {
    await seedProvider({ inputCost: 0.15, outputCost: 0.6 });
    mockOpenAIChatCreate.mockResolvedValue(
      okChat({
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 800 },
      }),
    );

    await chatCompletionForTask('chat', [{ role: 'user', content: 'hi' }], {
      teamId: TEAM_A,
    });

    await flushLlmUsage();
    const events = await LlmUsageEvent.find({});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      team_id: TEAM_A,
      task: 'chat',
      operation: 'chat',
      tier: 'global',
      provider_type: 'openrouter',
      model: 'test/metered-model',
      prompt_tokens: 1000,
      completion_tokens: 200,
      cached_prompt_tokens: 800,
      usage_reported: true,
    });
    expect(events[0].estimated_cost_usd).toBeCloseTo(
      (1000 / 1e6) * 0.15 + (200 / 1e6) * 0.6,
      12,
    );
    expect(events[0].duration_ms).toBeGreaterThanOrEqual(0);

    const daily = await LlmUsageDaily.find({});
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({
      team_id: TEAM_A,
      date: utcDateKey(new Date()),
      task: 'chat',
      model: 'test/metered-model',
      calls: 1,
      calls_without_usage: 0,
      prompt_tokens: 1000,
      completion_tokens: 200,
      cached_prompt_tokens: 800,
    });
  });

  it('accumulates repeated calls into one daily bucket rather than one row per call', async () => {
    await seedProvider();
    mockOpenAIChatCreate.mockResolvedValue(
      okChat({ prompt_tokens: 100, completion_tokens: 10 }),
    );

    await chatCompletionForTask('chat', [{ role: 'user', content: 'a' }], {
      teamId: TEAM_A,
    });
    await chatCompletionForTask('chat', [{ role: 'user', content: 'b' }], {
      teamId: TEAM_A,
    });
    await chatCompletionForTask('chat', [{ role: 'user', content: 'c' }], {
      teamId: TEAM_A,
    });

    await flushLlmUsage();
    const daily = await LlmUsageDaily.find({});
    expect(daily).toHaveLength(1);
    expect(daily[0].calls).toBe(3);
    expect(daily[0].prompt_tokens).toBe(300);
    expect(daily[0].completion_tokens).toBe(30);
  });

  it('keeps each team in its own bucket', async () => {
    await seedProvider();
    mockOpenAIChatCreate.mockResolvedValue(
      okChat({ prompt_tokens: 100, completion_tokens: 10 }),
    );

    await chatCompletionForTask('chat', [{ role: 'user', content: 'a' }], {
      teamId: TEAM_A,
    });
    await chatCompletionForTask('chat', [{ role: 'user', content: 'b' }], {
      teamId: TEAM_B,
    });

    await flushLlmUsage();
    const daily = await LlmUsageDaily.find({}).sort({ team_id: 1 });
    expect(new Set(daily.map((d) => d.team_id))).toEqual(
      new Set([TEAM_A, TEAM_B]),
    );
    expect(daily.every((d) => d.calls === 1)).toBe(true);
  });

  it('records a teamless call (ingestion, scheduled jobs) against a null team rather than dropping it', async () => {
    await seedProvider();
    mockOpenAIChatCreate.mockResolvedValue(
      okChat({ prompt_tokens: 50, completion_tokens: 5 }),
    );

    await chatCompletionForTask('chat', [{ role: 'user', content: 'a' }]);

    await flushLlmUsage();
    const events = await LlmUsageEvent.find({});
    expect(events).toHaveLength(1);
    expect(events[0].team_id).toBeNull();
  });

  it('marks a call the provider did not report usage for, instead of recording zero tokens', async () => {
    await seedProvider({ inputCost: 0.15 });
    mockOpenAIChatCreate.mockResolvedValue(okChat());

    await chatCompletionForTask('chat', [{ role: 'user', content: 'hi' }], {
      teamId: TEAM_A,
    });

    await flushLlmUsage();
    const [event] = await LlmUsageEvent.find({});
    expect(event.usage_reported).toBe(false);
    expect(event.prompt_tokens).toBeUndefined();
    expect(event.estimated_cost_usd).toBeUndefined();

    const [daily] = await LlmUsageDaily.find({});
    expect(daily.calls).toBe(1);
    // The confidence marker: this bucket's zero tokens are unknown, not measured.
    expect(daily.calls_without_usage).toBe(1);
    expect(daily.prompt_tokens).toBe(0);
  });

  it('records tokens but no cost for a model with no configured pricing', async () => {
    await seedProvider();
    mockOpenAIChatCreate.mockResolvedValue(
      okChat({ prompt_tokens: 100, completion_tokens: 10 }),
    );

    await chatCompletionForTask('chat', [{ role: 'user', content: 'hi' }], {
      teamId: TEAM_A,
    });

    await flushLlmUsage();
    const [event] = await LlmUsageEvent.find({});
    expect(event.prompt_tokens).toBe(100);
    expect(event.estimated_cost_usd).toBeUndefined();
  });

  it('does not bill a failed provider call', async () => {
    await seedProvider();
    mockOpenAIChatCreate.mockRejectedValue(
      Object.assign(new Error('bad request'), { status: 400 }),
    );

    await expect(
      chatCompletionForTask('chat', [{ role: 'user', content: 'hi' }], {
        teamId: TEAM_A,
      }),
    ).rejects.toThrow();

    await flushLlmUsage();
    expect(await LlmUsageEvent.countDocuments({})).toBe(0);
    expect(await LlmUsageDaily.countDocuments({})).toBe(0);
  });
});

describe('recording an embedding', () => {
  it('records one row per batch — the unit the provider billed', async () => {
    await seedProvider({ capabilities: ['embedding'], task: 'embedding' });
    mockOpenAIEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1] }],
      usage: { prompt_tokens: 12 },
    });

    await embedForTask('embedding', 'some text', { teamId: TEAM_A });

    await flushLlmUsage();
    const [event] = await LlmUsageEvent.find({});
    expect(event).toMatchObject({
      task: 'embedding',
      operation: 'embed',
      prompt_tokens: 12,
      completion_tokens: 0,
    });
  });
});

describe('metering never breaks the request', () => {
  it('returns the answer even when writing the ledger fails', async () => {
    await seedProvider();
    mockOpenAIChatCreate.mockResolvedValue(
      okChat({ prompt_tokens: 100, completion_tokens: 10 }),
    );

    const create = jest
      .spyOn(LlmUsageEvent, 'create')
      .mockRejectedValue(new Error('mongo is down') as never);
    try {
      const reply = await chatCompletionForTask(
        'chat',
        [{ role: 'user', content: 'hi' }],
        { teamId: TEAM_A },
      );
      expect(reply).toBe('ok');
    } finally {
      create.mockRestore();
    }
  });
});

describe('GET /api/v1/llm-usage', () => {
  const seedDaily = (
    teamId: string | null,
    date: string,
    overrides: Record<string, unknown> = {},
  ) =>
    LlmUsageDaily.create({
      team_id: teamId,
      date,
      task: 'chat',
      model: 'test/metered-model',
      calls: 1,
      calls_without_usage: 0,
      prompt_tokens: 1000,
      completion_tokens: 100,
      cached_prompt_tokens: 0,
      estimated_cost_usd: 0.001,
      ...overrides,
    });

  const today = utcDateKey(new Date());

  it("returns the caller's own team totals, broken down by task and day", async () => {
    const user = await createTestUser({ email: 'usage-member@example.test' });
    const team = await createTestTeam({ createdBy: user._id.toString() });
    await addTeamMember(team._id.toString(), user._id.toString());
    await seedDaily(team._id.toString(), today);

    const res = await request(app)
      .get('/api/v1/llm-usage')
      .set('Authorization', `Bearer ${createAuthToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({
      calls: 1,
      prompt_tokens: 1000,
      completion_tokens: 100,
    });
    expect(res.body.data.by_task[0]).toMatchObject({ key: 'chat', calls: 1 });
    expect(res.body.data.by_day[0]).toMatchObject({ key: today, calls: 1 });
  });

  it("never returns another team's spend when no team_id is given", async () => {
    // Omitting team_id must resolve to the caller's own team, not to a platform-wide total —
    // widening by default is what would turn a cost page into a leak between customers.
    const user = await createTestUser({ email: 'usage-scoped@example.test' });
    const own = await createTestTeam({
      name: 'Own',
      createdBy: user._id.toString(),
    });
    const other = await createTestTeam({
      name: 'Other',
      createdBy: user._id.toString(),
    });
    await addTeamMember(own._id.toString(), user._id.toString());
    await seedDaily(own._id.toString(), today, {
      calls: 1,
      prompt_tokens: 1000,
    });
    await seedDaily(other._id.toString(), today, {
      calls: 99,
      prompt_tokens: 999_999,
    });

    const res = await request(app)
      .get('/api/v1/llm-usage')
      .set('Authorization', `Bearer ${createAuthToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.calls).toBe(1);
    expect(res.body.data.totals.prompt_tokens).toBe(1000);
  });

  it("rejects a member asking for another team's spend", async () => {
    const user = await createTestUser({
      email: 'usage-forbidden@example.test',
    });
    const own = await createTestTeam({
      name: 'Own',
      createdBy: user._id.toString(),
    });
    const other = await createTestTeam({
      name: 'Other',
      createdBy: user._id.toString(),
    });
    await addTeamMember(own._id.toString(), user._id.toString());

    const res = await request(app)
      .get('/api/v1/llm-usage')
      .query({ team_id: other._id.toString() })
      .set('Authorization', `Bearer ${createAuthToken(user)}`);

    expect(res.status).toBe(403);
  });

  it('lets a super_admin see the platform-wide total across every team', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'usage-super@example.test',
    });
    const owner = await createTestUser({
      email: 'usage-super-owner@example.test',
    });
    const teamA = await createTestTeam({
      name: 'A',
      createdBy: owner._id.toString(),
    });
    const teamB = await createTestTeam({
      name: 'B',
      createdBy: owner._id.toString(),
    });
    await seedDaily(teamA._id.toString(), today, { calls: 2 });
    await seedDaily(teamB._id.toString(), today, { calls: 3 });

    const res = await request(app)
      .get('/api/v1/llm-usage')
      .set('Authorization', `Bearer ${createAuthToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.calls).toBe(5);
  });

  it('excludes days outside the requested window', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'usage-window@example.test',
    });
    await seedDaily(null, '2020-01-01', { calls: 7 });
    await seedDaily(null, today, { calls: 2 });

    const res = await request(app)
      .get('/api/v1/llm-usage')
      .query({ from: today, to: today })
      .set('Authorization', `Bearer ${createAuthToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.calls).toBe(2);
  });

  it('rejects a malformed date', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'usage-baddate@example.test',
    });

    const res = await request(app)
      .get('/api/v1/llm-usage')
      .query({ from: '01-01-2020' })
      .set('Authorization', `Bearer ${createAuthToken(admin)}`);

    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/llm-usage');
    expect(res.status).toBe(401);
  });
});
