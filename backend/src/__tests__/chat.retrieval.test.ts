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
    const [result] = rankNewsItems([candidate({ content: 'Full article text.' })], questionEmbedding, 1, 1);

    expect(result.content).toContain('Content: Full article text.');
  });

  it('omits the Content line when the candidate has no content', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const [result] = rankNewsItems([candidate()], questionEmbedding, 1, 1);

    expect(result.content).not.toContain('Content:');
  });

  it('truncates a long content excerpt to 300 characters', () => {
    const questionEmbedding = Array(1536).fill(0.01);
    const longContent = 'x'.repeat(500);
    const [result] = rankNewsItems([candidate({ content: longContent })], questionEmbedding, 1, 1);

    expect(result.content).toContain(`Content: ${'x'.repeat(300)}`);
    expect(result.content).not.toContain('x'.repeat(301));
  });
});
