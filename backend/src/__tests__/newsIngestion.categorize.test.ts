jest.mock('../app/lib/openrouterClient');

import { categorizeBatch } from '../app/modules/NewsIngestion/newsIngestion.categorize';
import { ScoredNewsItem } from '../app/modules/NewsIngestion/newsIngestion.interface';
import { getLastChatCompletionRequest, mockChatCompletion } from './support/openrouterMock';

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
});
