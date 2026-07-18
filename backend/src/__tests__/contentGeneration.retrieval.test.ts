import { buildStyleContext, rankStyleExamples, StyleExampleCandidate } from '../app/modules/ContentGeneration/contentGeneration.retrieval';

// topicEmbedding is a unit vector [1, 0]; giving a candidate embedding [s, sqrt(1-s^2)] (also unit
// length) makes cosineSimilarity(topicEmbedding, candidate) equal exactly `s` — so each candidate's
// similarity score can be set directly and unambiguously via `sim`.
const topicEmbedding = [1, 0];
const vecForSimilarity = (s: number): number[] => [s, Math.sqrt(1 - s * s)];

const candidate = (
  content: string,
  sim: number,
  platform: StyleExampleCandidate['platform'],
): StyleExampleCandidate => ({
  content,
  embedding: vecForSimilarity(sim),
  platform,
});

describe('rankStyleExamples', () => {
  it('with no preferredPlatform, ranks purely by similarity (byte-identical to pre-change behavior)', () => {
    const candidates = [
      candidate('low-fb', 0.2, 'facebook'),
      candidate('high-li', 0.9, 'linkedin'),
      candidate('mid-other', 0.5, 'other'),
    ];

    const result = rankStyleExamples(candidates, topicEmbedding, undefined, 3);

    expect(result.map((r) => r.content)).toEqual(['high-li', 'mid-other', 'low-fb']);
    expect(result.every((r) => r.source === 'style_pack_example')).toBe(true);
  });

  it('ranks platform matches first by similarity, then backfills the remainder from non-matches by similarity', () => {
    const candidates = [
      candidate('fb-high', 0.9, 'facebook'),
      candidate('fb-low', 0.8, 'facebook'),
      candidate('li-highest', 0.95, 'linkedin'),
      candidate('li-mid', 0.85, 'linkedin'),
      candidate('li-lowest', 0.75, 'linkedin'),
    ];

    const result = rankStyleExamples(candidates, topicEmbedding, 'facebook', 3);

    // Both facebook matches first (similarity order), then exactly one backfill item — the
    // highest-similarity non-match — to fill the remaining slot up to the limit.
    expect(result.map((r) => r.content)).toEqual(['fb-high', 'fb-low', 'li-highest']);
  });

  it('degrades to plain-similarity ranking when no example matches the preferred platform', () => {
    const candidates = [
      candidate('other-a', 0.9, 'other'),
      candidate('other-b', 0.7, 'other'),
      candidate('other-c', 0.5, 'other'),
      candidate('other-d', 0.3, 'other'),
      candidate('other-e', 0.1, 'other'),
      candidate('other-f', 0.05, 'other'),
    ];

    const withPreference = rankStyleExamples(candidates, topicEmbedding, 'facebook', 5);
    const withoutPreference = rankStyleExamples(candidates, topicEmbedding, undefined, 5);

    expect(withPreference).toEqual(withoutPreference);
    expect(withPreference.map((r) => r.content)).toEqual(['other-a', 'other-b', 'other-c', 'other-d', 'other-e']);
  });

  it('never backfills with non-matches once matches already fill the limit, even if a non-match scores higher', () => {
    const candidates = [
      candidate('fb-1', 0.6, 'facebook'),
      candidate('fb-2', 0.5, 'facebook'),
      candidate('fb-3', 0.4, 'facebook'),
      candidate('fb-4', 0.3, 'facebook'),
      // Higher raw similarity than every facebook example, but must not be selected — matches alone
      // already satisfy the limit.
      candidate('li-highest', 0.99, 'linkedin'),
    ];

    const result = rankStyleExamples(candidates, topicEmbedding, 'facebook', 3);

    expect(result.map((r) => r.content)).toEqual(['fb-1', 'fb-2', 'fb-3']);
    expect(result.some((r) => r.content === 'li-highest')).toBe(false);
  });

  it('defaults the limit to 5 when unspecified', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => candidate(`item-${i}`, 1 - i * 0.1, 'other'));

    const result = rankStyleExamples(candidates, topicEmbedding);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.content)).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
  });
});

describe('buildStyleContext', () => {
  const examples: StyleExampleCandidate[] = [
    candidate('fb example', 0.9, 'facebook'),
    candidate('li example', 0.8, 'linkedin'),
  ];

  it('returns undefined when no pack is resolved', () => {
    expect(buildStyleContext('facebook_post', null, examples, topicEmbedding)).toBeUndefined();
  });

  it('returns undefined when a pack is resolved but its examples were never fetched', () => {
    expect(buildStyleContext('facebook_post', { style_card: 'a card' }, null, topicEmbedding)).toBeUndefined();
  });

  it('includes the card and ranked examples matching a direct rankStyleExamples call for the same inputs', () => {
    const stylePack = { style_card: 'Energetic edtech tone.' };

    const result = buildStyleContext('facebook_post', stylePack, examples, topicEmbedding);
    const expectedExamples = rankStyleExamples(examples, topicEmbedding, 'facebook');

    expect(result).toEqual({ card: 'Energetic edtech tone.', examples: expectedExamples });
  });

  it('omits the card (card: undefined) when the pack has no style_card, but still includes examples', () => {
    const stylePack = { style_card: undefined };

    const result = buildStyleContext('linkedin_post', stylePack, examples, topicEmbedding);

    expect(result?.card).toBeUndefined();
    expect(result?.examples).toEqual(rankStyleExamples(examples, topicEmbedding, 'linkedin'));
  });

  it('passes through the format-appropriate platform preference (youtube_idea has none)', () => {
    const stylePack = { style_card: 'card' };

    const result = buildStyleContext('youtube_idea', stylePack, examples, topicEmbedding);

    // youtube_idea has no preferredPlatform — equivalent to calling rankStyleExamples with undefined.
    expect(result?.examples).toEqual(rankStyleExamples(examples, topicEmbedding, undefined));
  });
});
