import { Candidate, selectWithinBudget } from '../app/modules/NewsRefresh/newsRefresh.service';

const candidate = (source: string, source_id: string, ageMinutes: number): Candidate => ({
  _id: source_id,
  source,
  source_id,
  created_at: new Date(Date.now() - ageMinutes * 60 * 1000),
  engagement: { points: 0, comments: 0, stars_delta: 0 },
});

describe('selectWithinBudget', () => {
  it('processes candidates youngest-first and stops at the request cap', () => {
    // Oldest first in the input array (as if a wrong sort was applied upstream), all cost 1/item.
    const candidates = [
      candidate('hackernews', 'old', 180),
      candidate('hackernews', 'mid', 90),
      candidate('hackernews', 'young', 5),
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()); // youngest first, as the real query sorts

    const selected = selectWithinBudget(candidates, 2);

    expect(selected.hackernews.map((c) => c.source_id)).toEqual(['young', 'mid']);
  });

  it('stops issuing requests once the cap is reached, leaving older items unselected', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => candidate('devto', `d${i}`, i));

    const selected = selectWithinBudget(candidates, 3);

    expect(selected.devto).toHaveLength(3);
    expect(selected.devto.map((c) => c.source_id)).toEqual(['d0', 'd1', 'd2']);
  });

  it('returns an empty selection when the budget is exhausted before any item fits', () => {
    const candidates = [candidate('hackernews', 'a', 1)];

    const selected = selectWithinBudget(candidates, 0);

    expect(selected).toEqual({});
  });
});
