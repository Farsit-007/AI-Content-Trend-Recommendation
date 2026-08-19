import { splitAtCap } from '../app/modules/NewsIngestion/newsIngestion.categorize';
import { ScoredNewsItem } from '../app/modules/NewsIngestion/newsIngestion.interface';

/**
 * Layer 4 is the pipeline's only previously-unbounded LLM cost: adjudication has its own batch cap,
 * but categorization called once per ~10 survivors with no ceiling. Since relevance stopped gating
 * storage, every deduped fresh item reaches this layer, so a source returning 10x its usual volume
 * converted straight into 10x the spend.
 */

const item = (id: string, trend_score: number): ScoredNewsItem =>
  ({
    source: 'hackernews',
    source_id: id,
    content_hash: `hash-${id}`,
    title: `Story ${id}`,
    url: `https://example.test/${id}`,
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: 0,
    embedding: [],
    trend_score,
  }) as unknown as ScoredNewsItem;

describe('splitAtCap', () => {
  it('passes everything through when the item count is at or below the cap', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3)];

    for (const cap of [3, 4, 100]) {
      const { toCategorize, deferred } = splitAtCap(items, cap);
      expect(toCategorize).toHaveLength(3);
      expect(deferred).toHaveLength(0);
    }
  });

  it('sends the highest-trend items to the LLM and defers the coldest tail', () => {
    const items = [item('low', 1), item('high', 9), item('mid', 5)];

    const { toCategorize, deferred } = splitAtCap(items, 2);

    expect(toCategorize.map((i) => i.source_id)).toEqual(['high', 'mid']);
    expect(deferred.map((i) => i.source_id)).toEqual(['low']);
  });

  it('accounts for every input item — the cap defers, it never drops', () => {
    const items = Array.from({ length: 25 }, (_, i) => item(`s${i}`, i));

    const { toCategorize, deferred } = splitAtCap(items, 10);

    expect(toCategorize).toHaveLength(10);
    expect(deferred).toHaveLength(15);
    const seen = new Set([...toCategorize, ...deferred].map((i) => i.source_id));
    expect(seen.size).toBe(25);
  });

  it('does not mutate or reorder the caller\'s array', () => {
    const items = [item('low', 1), item('high', 9)];
    const originalOrder = items.map((i) => i.source_id);

    splitAtCap(items, 1);

    expect(items.map((i) => i.source_id)).toEqual(originalOrder);
  });

  it('treats a zero or negative cap as "no cap" rather than deferring everything', () => {
    // A misconfigured NEWS_INGESTION_MAX_CATEGORIZE_ITEMS must not silently disable categorization
    // for every item — that would look identical to the LLM failing on every batch.
    const items = [item('a', 1), item('b', 2)];

    for (const cap of [0, -1]) {
      const { toCategorize, deferred } = splitAtCap(items, cap);
      expect(toCategorize).toHaveLength(2);
      expect(deferred).toHaveLength(0);
    }
  });
});
