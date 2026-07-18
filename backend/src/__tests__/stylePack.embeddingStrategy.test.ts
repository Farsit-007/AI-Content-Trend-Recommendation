jest.mock('../app/lib/openrouterClient');

import config from '../app/config';
import {
  backfillMissingEmbeddingSource,
  extractTopicSummary,
  migrateExamplesForPack,
  resolveExampleEmbedding,
  resolveExamplesEmbeddingBatch,
} from '../app/modules/StylePack/stylePack.embeddingStrategy';
import { StyleExample, StylePack } from '../app/modules/StylePack/stylePack.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import {
  getOpenRouterCallCounts,
  mockChatCompletion,
  mockChatCompletionFailureOnce,
  mockChatCompletionSequence,
  mockEmbedding,
  mockEmbeddingBatch,
} from './support/openrouterMock';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('extractTopicSummary', () => {
  it('returns the summary text on a valid response', async () => {
    mockChatCompletion('A motivational post encouraging beginners to start coding today.');

    const result = await extractTopicSummary('কোডিং শিখতে দেরি হয়ে গেছে ভাবছেন?');

    expect(result).toBe('A motivational post encouraging beginners to start coding today.');
  });

  it('returns null when the LLM call fails (both primary and fallback)', async () => {
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();

    const result = await extractTopicSummary('some content');

    expect(result).toBeNull();
  });

  it('returns null on an empty response', async () => {
    mockChatCompletion('   ');

    const result = await extractTopicSummary('some content');

    expect(result).toBeNull();
  });
});

describe('resolveExampleEmbedding', () => {
  const originalFlag = config.style_packs.embed_examples_by_topic_summary;
  afterEach(() => {
    config.style_packs.embed_examples_by_topic_summary = originalFlag;
  });

  it('flag off: embeds the raw content, tagged embedding_source "content"', async () => {
    config.style_packs.embed_examples_by_topic_summary = false;
    mockEmbedding();

    const result = await resolveExampleEmbedding('some Bangla content');

    expect(result.embedding_source).toBe('content');
    expect(result.topic_summary).toBeUndefined();
    expect(result.embedding).toHaveLength(1536);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
  });

  it('flag on + successful extraction: embeds the summary, tagged "topic_summary"', async () => {
    config.style_packs.embed_examples_by_topic_summary = true;
    mockChatCompletion('A post about starting to code.');
    mockEmbedding();

    const result = await resolveExampleEmbedding('some Bangla content');

    expect(result.embedding_source).toBe('topic_summary');
    expect(result.topic_summary).toBe('A post about starting to code.');
  });

  it('flag on + failed extraction: falls back to content embedding', async () => {
    config.style_packs.embed_examples_by_topic_summary = true;
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();
    mockEmbedding();

    const result = await resolveExampleEmbedding('some Bangla content');

    expect(result.embedding_source).toBe('content');
    expect(result.topic_summary).toBeUndefined();
  });
});

describe('resolveExamplesEmbeddingBatch', () => {
  const originalFlag = config.style_packs.embed_examples_by_topic_summary;
  afterEach(() => {
    config.style_packs.embed_examples_by_topic_summary = originalFlag;
  });

  it('flag off: embeds every item from its raw content in one batch call, no chat-completion calls', async () => {
    config.style_packs.embed_examples_by_topic_summary = false;
    mockEmbeddingBatch();

    const results = await resolveExamplesEmbeddingBatch(['content one', 'content two']);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.embedding_source === 'content')).toBe(true);
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);
  });

  it('flag on: extracts a summary per item, embeds whichever text each item resolved to, in one batch call', async () => {
    config.style_packs.embed_examples_by_topic_summary = true;
    mockChatCompletionSequence(['Summary one.', 'Summary two.']);
    mockEmbeddingBatch();

    const results = await resolveExamplesEmbeddingBatch(['content one', 'content two']);

    expect(results.map((r) => r.embedding_source)).toEqual(['topic_summary', 'topic_summary']);
    expect(results.map((r) => r.topic_summary)).toEqual(['Summary one.', 'Summary two.']);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(1);
  });

  it("one item's extraction failure does not affect another item's resolution", async () => {
    config.style_packs.embed_examples_by_topic_summary = true;
    // Item 1 succeeds; item 2's primary+fallback both fail.
    mockChatCompletionSequence(['Summary one.']);
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();
    mockEmbeddingBatch();

    const results = await resolveExamplesEmbeddingBatch(['content one', 'content two']);

    expect(results[0]).toMatchObject({ embedding_source: 'topic_summary', topic_summary: 'Summary one.' });
    expect(results[1]).toMatchObject({ embedding_source: 'content' });
    expect(results[1].topic_summary).toBeUndefined();
  });
});

const createPack = () =>
  StylePack.create({
    name: 'Migration Test Pack',
    slug: `migration-test-${Date.now()}-${Math.random()}`,
    language: 'bangla',
    is_active: true,
    created_by: 'test-seed',
  });

describe('backfillMissingEmbeddingSource', () => {
  it('sets embedding_source on rows that predate the field, and is a no-op on a second run', async () => {
    const pack = await createPack();
    // Simulate a pre-existing row created before this field existed: insert directly, bypassing
    // the schema default (Mongoose defaults only apply to newly-instantiated documents, not to
    // documents already stored without the field).
    await StyleExample.collection.insertOne({
      style_pack_id: pack._id.toString(),
      content: 'a pre-existing example',
      embedding: Array(1536).fill(0.01),
      platform: 'other',
      created_at: new Date(),
    });

    const firstRun = await backfillMissingEmbeddingSource();
    expect(firstRun).toBeGreaterThanOrEqual(1);

    const stored = await StyleExample.findOne({ style_pack_id: pack._id.toString() });
    expect(stored?.embedding_source).toBe('content');

    const secondRun = await backfillMissingEmbeddingSource();
    expect(secondRun).toBe(0);
  });
});

describe('migrateExamplesForPack', () => {
  it('migrates candidate rows and skips rows already marked topic_summary', async () => {
    const pack = await createPack();
    await StyleExample.create([
      { style_pack_id: pack._id.toString(), content: 'needs migration', embedding: Array(1536).fill(0.01), embedding_source: 'content' },
      { style_pack_id: pack._id.toString(), content: 'already migrated', embedding: Array(1536).fill(0.02), embedding_source: 'topic_summary', topic_summary: 'existing summary' },
    ]);

    mockChatCompletion('A summary of the post that needed migration.');
    mockEmbeddingBatch();

    const result = await migrateExamplesForPack(pack._id.toString());

    expect(result).toEqual({ migrated: 1, failed: 0, candidates: 1 });
    const migratedDoc = await StyleExample.findOne({ style_pack_id: pack._id.toString(), content: 'needs migration' });
    expect(migratedDoc?.embedding_source).toBe('topic_summary');
    expect(migratedDoc?.topic_summary).toBe('A summary of the post that needed migration.');
  });

  it('re-running against an already-fully-migrated pack touches zero rows', async () => {
    const pack = await createPack();
    await StyleExample.create({
      style_pack_id: pack._id.toString(),
      content: 'already migrated',
      embedding: Array(1536).fill(0.01),
      embedding_source: 'topic_summary',
      topic_summary: 'existing summary',
    });

    const result = await migrateExamplesForPack(pack._id.toString());

    expect(result).toEqual({ migrated: 0, failed: 0, candidates: 0 });
    expect(getOpenRouterCallCounts().chatCompletionCalls).toBe(0);
    expect(getOpenRouterCallCounts().embeddingCalls).toBe(0);
  });

  it("an extraction failure leaves that row's existing embedding/marker untouched while other rows still migrate", async () => {
    const pack = await createPack();
    await StyleExample.create([
      { style_pack_id: pack._id.toString(), content: 'will succeed', embedding: Array(1536).fill(0.01), embedding_source: 'content' },
      { style_pack_id: pack._id.toString(), content: 'will fail', embedding: Array(1536).fill(0.02), embedding_source: 'content' },
    ]);

    // Order of iteration follows insertion/query order — first candidate succeeds, second fails
    // (both its primary and fallback attempts).
    mockChatCompletionSequence(['A summary of the successful post.']);
    mockChatCompletionFailureOnce();
    mockChatCompletionFailureOnce();
    mockEmbeddingBatch();

    const result = await migrateExamplesForPack(pack._id.toString());

    expect(result).toEqual({ migrated: 1, failed: 1, candidates: 2 });

    const succeeded = await StyleExample.findOne({ style_pack_id: pack._id.toString(), content: 'will succeed' });
    expect(succeeded?.embedding_source).toBe('topic_summary');

    const failedDoc = await StyleExample.findOne({ style_pack_id: pack._id.toString(), content: 'will fail' });
    expect(failedDoc?.embedding_source).toBe('content');
    expect(failedDoc?.embedding).toEqual(Array(1536).fill(0.02)); // untouched — still its original embedding
  });
});
