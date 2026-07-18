import { findSemanticallyRelevantItems } from '../app/modules/NewsItem/newsItem.semanticMatch';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// Only the early-return paths are exercisable here: the real $vectorSearch aggregation stage is
// Atlas Vector Search, which mongodb-memory-server (this suite's test database) does not
// implement — calling it here would error, not run against fake data. The merge/tagging logic
// that consumes this function's output is covered instead via a mock in
// newsItem.integration.test.ts's "Semantic nearly relevant feed tier" describe block.
describe('findSemanticallyRelevantItems — early-return paths (no live $vectorSearch call)', () => {
  it('returns an empty array immediately when limit is 0 or negative, without querying anything', async () => {
    const result = await findSemanticallyRelevantItems('team-1', ['AI'], [], 0, 0.75);
    expect(result).toEqual([]);
  });

  it('returns an empty array when the team has no brand-voice examples yet', async () => {
    const result = await findSemanticallyRelevantItems('team-with-no-brand-voice', ['AI'], [], 5, 0.75);
    expect(result).toEqual([]);
  });
});
