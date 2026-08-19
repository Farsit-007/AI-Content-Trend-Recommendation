import { Types } from 'mongoose';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { NewsItemTeamScore } from '../app/modules/NewsItemTeamScore/newsItemTeamScore.model';
import {
  audienceFitOf,
  countAboveOpportunityForTeam,
  rankItemIdsForTeam,
  scoreItemForPool,
  scoreItemsForAllTeams,
  upsertTeamScores,
} from '../app/modules/NewsItemTeamScore/newsItemTeamScore.service';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { createTestTeam } from './support/fixtures';

/**
 * Relevance is per-team by construction: it is the similarity between an item and *a team's* brand
 * voice. These assert the property the old single global score could not have — that two teams with
 * different voices get different rankings for the same shared items.
 */

/** One-hot vectors are pairwise orthogonal, so similarity is exactly 1 with itself and 0 otherwise. */
const oneHot = (index: number): number[] => {
  const v = Array(1536).fill(0);
  v[index] = 1;
  return v;
};

let seq = 0;
const makeItem = async (overrides: Record<string, unknown> = {}) => {
  seq += 1;
  return NewsItem.create({
    source: 'hackernews',
    source_id: `s${seq}`,
    content_hash: `hash-${seq}`,
    title: `Story ${seq}`,
    url: `https://example.test/${seq}`,
    embedding: oneHot(0),
    trend_score: 5,
    audience_fit: 0.5,
    lifecycle: 'active',
    ...overrides,
  });
};

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('audienceFitOf', () => {
  it('prefers the stored value', () => {
    expect(audienceFitOf({ audience_fit: 0.8, relevance_score: 2 })).toBe(0.8);
  });

  it('falls back to relevance/10 for items ingested before the field existed', () => {
    expect(audienceFitOf({ relevance_score: 6 })).toBeCloseTo(0.6);
    expect(audienceFitOf({})).toBe(0);
  });

  it('treats a stored zero as a real value, not as missing', () => {
    expect(audienceFitOf({ audience_fit: 0, relevance_score: 9 })).toBe(0);
  });
});

describe('scoreItemForPool', () => {
  const item = { _id: new Types.ObjectId(), embedding: oneHot(0), trend_score: 5, audience_fit: 0.5 };

  it('returns null on a cold-start (empty) pool rather than a zero score', () => {
    // "We can't judge this yet" and "we judged it irrelevant" must not collapse into the same number,
    // or a team with no brand voice would see every item ranked as maximally irrelevant.
    expect(scoreItemForPool(item, [])).toBeNull();
  });

  it('scores an exact voice match at the top of the scale', () => {
    const scored = scoreItemForPool(item, [oneHot(0)]);
    expect(scored?.relevance_score).toBe(10);
  });

  it('scores an orthogonal voice at the bottom', () => {
    const scored = scoreItemForPool(item, [oneHot(7)]);
    expect(scored?.relevance_score).toBe(0);
  });
});

describe('per-team scoring end to end', () => {
  it('gives two teams different scores for the same item, based on their own voices', async () => {
    const teamA = await createTestTeam({ name: 'A' });
    const teamB = await createTestTeam({ name: 'B' });
    const item = await makeItem({ embedding: oneHot(0) });

    // Team A's voice matches the item exactly; team B's is orthogonal to it.
    await BrandVoiceExample.create({ team_id: teamA._id.toString(), platform: 'facebook', content: 'a', embedding: oneHot(0) });
    await BrandVoiceExample.create({ team_id: teamB._id.toString(), platform: 'facebook', content: 'b', embedding: oneHot(9) });

    await scoreItemsForAllTeams([
      { _id: item._id, embedding: item.embedding, trend_score: item.trend_score, audience_fit: item.audience_fit },
    ]);

    const a = await NewsItemTeamScore.findOne({ team_id: teamA._id.toString(), news_item_id: item._id });
    const b = await NewsItemTeamScore.findOne({ team_id: teamB._id.toString(), news_item_id: item._id });

    expect(a?.relevance_score).toBe(10);
    expect(b?.relevance_score).toBe(0);
    // This gap is the whole point: one shared item, two honest and different opportunity scores.
    expect(a!.opportunity_score).toBeGreaterThan(b!.opportunity_score);
  });

  it('skips a team with no brand voice instead of writing a zero score', async () => {
    const team = await createTestTeam();
    const item = await makeItem();

    const written = await upsertTeamScores(team._id.toString(), [
      { _id: item._id, embedding: item.embedding, trend_score: 5, audience_fit: 0.5 },
    ]);

    expect(written).toBe(0);
    expect(await NewsItemTeamScore.countDocuments({})).toBe(0);
  });

  it('is idempotent — rescoring updates in place rather than duplicating', async () => {
    const team = await createTestTeam();
    const item = await makeItem();
    await BrandVoiceExample.create({ team_id: team._id.toString(), platform: 'facebook', content: 'a', embedding: oneHot(0) });

    const scorable = [{ _id: item._id, embedding: item.embedding, trend_score: 5, audience_fit: 0.5 }];
    await upsertTeamScores(team._id.toString(), scorable);
    await upsertTeamScores(team._id.toString(), scorable);

    expect(await NewsItemTeamScore.countDocuments({ news_item_id: item._id })).toBe(1);
  });
});

describe('rankItemIdsForTeam', () => {
  it('orders by the team\'s own score, not the shared baseline', async () => {
    const team = await createTestTeam();
    const teamId = team._id.toString();

    // `dull` looks better platform-wide, `sharp` matches THIS team's voice. The team's ranking must
    // put `sharp` first — under the old global score, `dull` would have won.
    const dull = await makeItem({ embedding: oneHot(5), opportunity_score: 9.9, content_hash: 'h-dull' });
    const sharp = await makeItem({ embedding: oneHot(0), opportunity_score: 1.0, content_hash: 'h-sharp' });

    await BrandVoiceExample.create({ team_id: teamId, platform: 'facebook', content: 'v', embedding: oneHot(0) });
    await scoreItemsForAllTeams([
      { _id: dull._id, embedding: dull.embedding, trend_score: 5, audience_fit: 0.5 },
      { _id: sharp._id, embedding: sharp.embedding, trend_score: 5, audience_fit: 0.5 },
    ]);

    const ranked = await rankItemIdsForTeam({ lifecycle: 'active' }, teamId, 0, 10, true);

    expect(ranked.map(String)).toEqual([sharp._id.toString(), dull._id.toString()]);
  });

  it('falls back to the stored baseline for an item this team has no score for', async () => {
    const team = await createTestTeam();
    const teamId = team._id.toString();
    await BrandVoiceExample.create({ team_id: teamId, platform: 'facebook', content: 'v', embedding: oneHot(0) });

    const scored = await makeItem({ embedding: oneHot(0), opportunity_score: 0, content_hash: 'h-scored' });
    const unscored = await makeItem({ embedding: oneHot(3), opportunity_score: 8, content_hash: 'h-unscored' });

    // Only `scored` gets a team row; `unscored` must still rank on its baseline rather than sorting
    // as null and clumping at one end.
    await upsertTeamScores(teamId, [{ _id: scored._id, embedding: scored.embedding, trend_score: 5, audience_fit: 0.5 }]);

    const ranked = await rankItemIdsForTeam({ lifecycle: 'active' }, teamId, 0, 10, true);

    expect(ranked).toHaveLength(2);
    expect(ranked.map(String)).toContain(unscored._id.toString());
  });

  it('paginates over the ranked order rather than re-sorting one page', async () => {
    const team = await createTestTeam();
    const teamId = team._id.toString();
    await BrandVoiceExample.create({ team_id: teamId, platform: 'facebook', content: 'v', embedding: oneHot(0) });

    const items = [];
    for (let i = 0; i < 5; i += 1) {
      items.push(await makeItem({ embedding: oneHot(0), trend_score: i, content_hash: `h-${i}` }));
    }
    await scoreItemsForAllTeams(
      items.map((it) => ({ _id: it._id, embedding: it.embedding, trend_score: it.trend_score, audience_fit: 0.5 })),
    );

    const page1 = await rankItemIdsForTeam({ lifecycle: 'active' }, teamId, 0, 2, true);
    const page2 = await rankItemIdsForTeam({ lifecycle: 'active' }, teamId, 2, 2, true);

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    // No item may appear on two pages — the failure mode of ranking after fetching.
    const overlap = page1.map(String).filter((id) => page2.map(String).includes(id));
    expect(overlap).toEqual([]);
  });
});

describe('countAboveOpportunityForTeam', () => {
  it('counts against this team\'s scores, not the shared baseline', async () => {
    const team = await createTestTeam();
    const teamId = team._id.toString();
    await BrandVoiceExample.create({ team_id: teamId, platform: 'facebook', content: 'v', embedding: oneHot(0) });

    // High platform-wide, irrelevant to this team — must NOT count as high opportunity for them.
    const offVoice = await makeItem({ embedding: oneHot(4), opportunity_score: 9.9, content_hash: 'h-off' });
    await scoreItemsForAllTeams([
      { _id: offVoice._id, embedding: offVoice.embedding, trend_score: 0, audience_fit: 0 },
    ]);

    expect(await countAboveOpportunityForTeam({ lifecycle: 'active' }, teamId, 7.5)).toBe(0);
  });
});
