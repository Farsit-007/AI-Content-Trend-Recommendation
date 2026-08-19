jest.mock('../app/lib/openrouterClient');

import { categorizeBatch } from '../app/modules/NewsIngestion/newsIngestion.categorize';
import { ScoredNewsItem } from '../app/modules/NewsIngestion/newsIngestion.interface';
import { NewsCategoryTaxonomy } from '../app/modules/NewsCategoryTaxonomy/newsCategoryTaxonomy.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { getLastChatCompletionRequest, mockChatCompletion } from './support/openrouterMock';

// categorizeBatch now resolves its model via chatCompletionForTask, which reads LlmTaskDefault/Team
// from Mongo even on the bootstrap (no LlmProvider records configured) path.
beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const baseItem = (overrides: Partial<ScoredNewsItem> = {}): ScoredNewsItem => ({
  source: 'hackernews',
  source_id: '1',
  title: 'A great story',
  url: 'https://example.test/a',
  content_hash: 'hash-1',
  embedding: Array(1536).fill(0.01),
  trend_score: 5,
  relevance_score: 6,
  raw_points: 10,
  raw_comments: 2,
  raw_stars_delta: 0,
  ...overrides,
});

const cannedCategorization = (items: ScoredNewsItem[]): string =>
  JSON.stringify(items.map((_, id) => ({ id, category: 'AI', impact_note: 'note', confidence: 0.9, audience_fit: 0.5 })));

describe('categorizeBatch prompt content', () => {
  it('includes a content lead when the item has content', async () => {
    const item = baseItem({ content: 'x'.repeat(600), snippet: 'short snippet' });
    mockChatCompletion(cannedCategorization([item]));

    await categorizeBatch([item]);

    const prompt = getLastChatCompletionRequest().messages[1].content;
    expect(prompt).toContain(` — content: ${item.content!.slice(0, 500)}`);
  });

  it('renders the pre-change line unchanged when there is no content', async () => {
    const item = baseItem({ snippet: 'short snippet' });
    mockChatCompletion(cannedCategorization([item]));

    await categorizeBatch([item]);

    const prompt = getLastChatCompletionRequest().messages[1].content;
    expect(prompt).toBe(`0. "${item.title}" — short snippet (relevance_score=6, trend_score=5)`);
  });

  it('includes the known-categories grounding list in the system prompt', async () => {
    const item = baseItem();
    mockChatCompletion(cannedCategorization([item]));

    await categorizeBatch([item]);

    const systemPrompt = getLastChatCompletionRequest().messages[0].content;
    expect(systemPrompt).toContain('"AI" (under "AI")');
    expect(systemPrompt).toContain('"DevOps" (under "DevOps")');
  });
});

describe('categorizeBatch — global category taxonomy (flexible-news-taxonomy-and-relevance)', () => {
  const cannedWithCategory = (
    items: ScoredNewsItem[],
    category: string,
    broad_group: string,
  ): string =>
    JSON.stringify(
      items.map((_, id) => ({ id, category, broad_group, impact_note: 'note', confidence: 0.9, audience_fit: 0.5 })),
    );

  it('reuses the existing fixed-six category exactly (no duplicate taxonomy entry)', async () => {
    const item = baseItem();
    mockChatCompletion(cannedWithCategory([item], 'AI', 'AI'));

    const [result] = (await categorizeBatch([item])).items;

    expect(result.category).toBe('AI');
    expect(result.category_group).toBe('AI');
    const count = await NewsCategoryTaxonomy.countDocuments({ normalized_key: 'ai' });
    expect(count).toBe(1);
  });

  it('reuses the canonical entry for a case/whitespace variant instead of creating a duplicate', async () => {
    const item = baseItem();
    mockChatCompletion(cannedWithCategory([item], '  ai  ', 'AI'));

    const [result] = (await categorizeBatch([item])).items;

    expect(result.category).toBe('AI'); // canonical casing from the taxonomy, not " ai "
    const count = await NewsCategoryTaxonomy.countDocuments({ normalized_key: 'ai' });
    expect(count).toBe(1);
  });

  it('creates a new taxonomy entry for a genuinely new category, with the correct broad group', async () => {
    const item = baseItem();
    mockChatCompletion(cannedWithCategory([item], 'LLM Tooling', 'AI'));

    const [result] = (await categorizeBatch([item])).items;

    expect(result.category).toBe('LLM Tooling');
    expect(result.category_group).toBe('AI');
    const entry = await NewsCategoryTaxonomy.findOne({ normalized_key: 'llm tooling' });
    expect(entry).not.toBeNull();
    expect(entry?.broad_group).toBe('AI');
    expect(entry?.source).toBe('ingestion');
  });

  it('falls back to "Other" as the broad group when the model proposes an invalid one for a new category', async () => {
    const item = baseItem();
    mockChatCompletion(cannedWithCategory([item], 'Quantum Computing', 'not-a-real-group'));

    const [result] = (await categorizeBatch([item])).items;

    expect(result.category).toBe('Quantum Computing');
    expect(result.category_group).toBe('Other');
  });

  it('a second, later categorization of the same new category reuses it rather than duplicating', async () => {
    const item1 = baseItem({ source_id: '1', content_hash: 'hash-1' });
    mockChatCompletion(cannedWithCategory([item1], 'LLM Tooling', 'AI'));
    await categorizeBatch([item1]);

    const item2 = baseItem({ source_id: '2', content_hash: 'hash-2' });
    mockChatCompletion(cannedWithCategory([item2], 'LLM Tooling', 'AI'));
    const [result2] = (await categorizeBatch([item2])).items;

    expect(result2.category).toBe('LLM Tooling');
    const count = await NewsCategoryTaxonomy.countDocuments({ normalized_key: 'llm tooling' });
    expect(count).toBe(1);
  });

  it('falls back to Other/Other when the categorization response is malformed', async () => {
    const item = baseItem();
    mockChatCompletion('not valid json');

    const [result] = (await categorizeBatch([item])).items;

    expect(result.category).toBe('Other');
    expect(result.category_group).toBe('Other');
  });
});
