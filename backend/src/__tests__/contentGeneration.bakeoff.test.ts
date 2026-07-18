jest.mock('../app/lib/openrouterClient');

import {
  BakeoffRun,
  buildLabelMap,
  formatReviewMarkdown,
  labelForPosition,
  runBakeoffMatrix,
  shuffleWithSeed,
} from '../app/modules/ContentGeneration/contentGeneration.bakeoff';
import { StylePack } from '../app/modules/StylePack/stylePack.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import {
  getOpenRouterCallCounts,
  mockChatCompletionFailureOnce,
  mockChatCompletionSequence,
  mockEmbedding,
} from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('shuffleWithSeed', () => {
  it('produces the same order for the same seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);

    expect(shuffleWithSeed(items, 42)).toEqual(shuffleWithSeed(items, 42));
  });

  it('produces a different order for a different seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);

    expect(shuffleWithSeed(items, 42)).not.toEqual(shuffleWithSeed(items, 43));
  });

  it('does not lose or duplicate items', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);

    expect([...shuffleWithSeed(items, 7)].sort((a, b) => a - b)).toEqual(items);
  });
});

describe('labelForPosition / buildLabelMap', () => {
  const buildRun = (models: string[]): BakeoffRun => ({
    seed: 1,
    startedAt: '2026-07-18T00:00:00.000Z',
    packSlug: 'test-pack',
    cells: models.map((model) => ({
      model,
      topic: 'a topic',
      format: 'facebook_post',
      systemPrompt: 'system',
      userPrompt: 'user',
      output: `output for ${model}`,
      latency_ms: 100,
    })),
  });

  it('assigns a distinct, model-agnostic label per position', () => {
    expect(labelForPosition(0)).toBe('Sample A1');
    expect(labelForPosition(1)).toBe('Sample B1');
    expect(labelForPosition(25)).toBe('Sample Z1');
    expect(labelForPosition(26)).toBe('Sample A2');
  });

  it('maps each label back to the correct cell, regardless of shuffle order', () => {
    const run = buildRun(['model-a', 'model-b', 'model-c']);
    const shuffled = [2, 0, 1];

    const map = buildLabelMap(run, shuffled);

    expect(map).toEqual([
      { label: 'Sample A1', cell: run.cells[2] },
      { label: 'Sample B1', cell: run.cells[0] },
      { label: 'Sample C1', cell: run.cells[1] },
    ]);
  });
});

describe('formatReviewMarkdown — blinding', () => {
  it('never mentions any model id anywhere in the output', () => {
    const run: BakeoffRun = {
      seed: 1,
      startedAt: '2026-07-18T00:00:00.000Z',
      packSlug: 'test-pack',
      cells: [
        { model: 'super-secret-model-xyz', topic: 'topic A', format: 'facebook_post', systemPrompt: 's', userPrompt: 'u', output: 'Output A', latency_ms: 100 },
        { model: 'another-model-abc', topic: 'topic B', format: 'linkedin_post', systemPrompt: 's', userPrompt: 'u', output: 'Output B', latency_ms: 100 },
      ],
    };
    const shuffled = shuffleWithSeed([0, 1], run.seed);

    const markdown = formatReviewMarkdown(run, shuffled);

    expect(markdown).not.toContain('super-secret-model-xyz');
    expect(markdown).not.toContain('another-model-abc');
    expect(markdown).toContain('Output A');
    expect(markdown).toContain('Output B');
    expect(markdown).toContain('Sample');
  });

  it('renders a rubric table and a placeholder for a failed cell without leaking the error stack into a score', () => {
    const run: BakeoffRun = {
      seed: 1,
      startedAt: '2026-07-18T00:00:00.000Z',
      packSlug: 'test-pack',
      cells: [{ model: 'model-a', topic: 'topic A', format: 'facebook_post', systemPrompt: 's', userPrompt: 'u', error: 'rate limited', latency_ms: 50 }],
    };

    const markdown = formatReviewMarkdown(run, [0]);

    expect(markdown).toContain('Generation failed: rate limited');
    expect(markdown).toContain('Bangla correctness');
    expect(markdown).toContain('Publish with');
  });
});

describe('runBakeoffMatrix — matrix caps', () => {
  it('rejects more than 4 models before any DB or LLM call', async () => {
    await expect(
      runBakeoffMatrix({
        models: ['m1', 'm2', 'm3', 'm4', 'm5'],
        topics: [{ topic: 'x' }],
        formats: ['facebook_post'],
        packSlug: 'does-not-matter',
      }),
    ).rejects.toThrow(/models must have between 1 and 4/);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(0);
  });

  it('rejects more than 8 topics before any DB or LLM call', async () => {
    await expect(
      runBakeoffMatrix({
        models: ['m1'],
        topics: Array.from({ length: 9 }, (_, i) => ({ topic: `topic ${i}` })),
        formats: ['facebook_post'],
        packSlug: 'does-not-matter',
      }),
    ).rejects.toThrow(/topics must have between 1 and 8/);
  });

  it('rejects more than 2 formats before any DB or LLM call', async () => {
    await expect(
      runBakeoffMatrix({
        models: ['m1'],
        topics: [{ topic: 'x' }],
        formats: ['facebook_post', 'linkedin_post', 'caption'],
        packSlug: 'does-not-matter',
      }),
    ).rejects.toThrow(/formats must have between 1 and 2/);
  });

  it('rejects an unresolvable pack slug', async () => {
    await expect(
      runBakeoffMatrix({
        models: ['m1'],
        topics: [{ topic: 'x' }],
        formats: ['facebook_post'],
        packSlug: 'no-such-pack',
      }),
    ).rejects.toThrow(/not found or inactive/);
  });
});

describe('runBakeoffMatrix — per-cell failure isolation', () => {
  it("captures one model's failure on its cell without affecting the other model's cell", async () => {
    const pack = await StylePack.create({
      name: 'Bakeoff Test Pack',
      slug: `bakeoff-test-${Date.now()}`,
      language: 'bangla',
      is_active: true,
      created_by: 'test-seed',
    });

    mockEmbedding();
    mockChatCompletionSequence(['Model A output']);
    // model-b's primary call and its automatic fallback-model retry both fail.
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();

    const run = await runBakeoffMatrix({
      models: ['model-a', 'model-b'],
      topics: [{ topic: 'AI agents in content marketing' }],
      formats: ['facebook_post'],
      packSlug: pack.slug,
    });

    expect(run.cells).toHaveLength(2);
    const cellA = run.cells.find((c) => c.model === 'model-a');
    const cellB = run.cells.find((c) => c.model === 'model-b');

    expect(cellA?.output).toBe('Model A output');
    expect(cellA?.error).toBeUndefined();
    expect(cellB?.output).toBeUndefined();
    expect(cellB?.error).toBeDefined();
  });
});
