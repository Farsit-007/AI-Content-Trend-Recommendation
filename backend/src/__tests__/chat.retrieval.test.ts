import { NewsCandidate, rankNewsItems } from '../app/modules/Chat/chat.retrieval';

const candidate = (overrides: Partial<NewsCandidate> = {}): NewsCandidate => ({
  title: 'A trending story',
  trend_score: 5,
  embedding: Array(1536).fill(0.01),
  ...overrides,
});

describe('rankNewsItems', () => {
  it('includes a Content line when the candidate has content', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const { context } = rankNewsItems([candidate({ content: 'Full article text.' })], questionEmbedding, 1);

    expect(context[0].content).toContain('Content: Full article text.');
  });

  it('omits the Content line when the candidate has no content', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const { context } = rankNewsItems([candidate()], questionEmbedding, 1);

    expect(context[0].content).not.toContain('Content:');
  });

  it('truncates a long content excerpt to 300 characters', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const longContent = 'x'.repeat(500);
    const { context } = rankNewsItems([candidate({ content: longContent })], questionEmbedding, 1);

    expect(context[0].content).toContain(`Content: ${'x'.repeat(300)}`);
    expect(context[0].content).not.toContain('x'.repeat(301));
  });

  it('selects a low-trend, high-similarity item over a high-trend, low-similarity one', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const offTopicEmbedding = Array(1536).fill(-0.01);
    const { context, topSimilarity, poolSize } = rankNewsItems(
      [
        candidate({ title: 'off-topic-high-trend', trend_score: 9, embedding: offTopicEmbedding }),
        candidate({ title: 'on-topic-low-trend', trend_score: 1, embedding: questionEmbedding }),
      ],
      questionEmbedding,
      1,
    );

    expect(context[0].content).toContain('on-topic-low-trend');
    expect(poolSize).toBe(2);
    expect(topSimilarity).toBeGreaterThan(0.9);
  });

  it('reports topSimilarity 0 and poolSize 0 for an empty pool', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const { context, topSimilarity, poolSize } = rankNewsItems([], questionEmbedding, 5);

    expect(context).toHaveLength(0);
    expect(topSimilarity).toBe(0);
    expect(poolSize).toBe(0);
  });
});
