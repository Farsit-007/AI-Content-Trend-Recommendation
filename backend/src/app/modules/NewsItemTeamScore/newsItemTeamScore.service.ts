import { Types } from 'mongoose';
import config from '../../config';
import { logger } from '../../lib/logger';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { computeOpportunityScore, scoreRelevance } from '../NewsIngestion/newsIngestion.scoring';
import { NewsItem } from '../NewsItem/newsItem.model';
import { NewsItemTeamScore } from './newsItemTeamScore.model';

/** The item fields scoring needs. Kept narrow so callers can pass a lean projection. */
export interface ScorableItem {
  _id: Types.ObjectId;
  embedding: number[];
  trend_score: number;
  relevance_score?: number;
  audience_fit?: number;
}

const SCORING_PROJECTION = { embedding: 1, trend_score: 1, relevance_score: 1, audience_fit: 1 } as const;

/**
 * `audience_fit` was not persisted before this change, so items ingested earlier have none. Falling
 * back to `relevance_score / 10` reuses exactly the expression `fallbackCategorize` already uses when
 * the categorization LLM gives an unusable answer — so an old item scores as if its categorization
 * had soft-failed, which is honest, rather than as if its audience fit were zero.
 */
export const audienceFitOf = (item: { audience_fit?: number; relevance_score?: number }): number =>
  item.audience_fit ?? (item.relevance_score ?? 0) / 10;

/** One team's own brand-voice embeddings. Empty means cold start — the caller skips that team. */
export const fetchTeamBrandVoicePool = async (teamId: string): Promise<number[][]> => {
  const examples = await BrandVoiceExample.find({ team_id: teamId }, { embedding: 1 }).lean();
  return examples.map((e) => e.embedding);
};

/** Every team that has told us what it sounds like. A team with no examples has nothing to score against. */
export const teamsWithBrandVoice = async (): Promise<string[]> => {
  const ids = await BrandVoiceExample.distinct('team_id');
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
};

/**
 * Pure scoring step, split from every database concern so it is testable without Mongo — the same
 * split `rankBrandVoiceExamples` and `dedupeSemantic` already use elsewhere in this codebase.
 * Returns `null` for a cold-start pool rather than a zero score: "we cannot judge this yet" and
 * "we judged it irrelevant" are different claims, and only the second should sink an item's ranking.
 */
export const scoreItemForPool = (
  item: ScorableItem,
  pool: number[][],
): { relevance_score: number; opportunity_score: number } | null => {
  const relevance = scoreRelevance(item.embedding, pool);
  if (relevance === undefined) return null;

  return {
    relevance_score: relevance,
    opportunity_score: computeOpportunityScore(
      relevance,
      item.trend_score,
      audienceFitOf(item),
      config.news_ingestion,
    ),
  };
};

/**
 * Recomputes and upserts one team's scores for the given items.
 *
 * Never throws — scoring is a ranking refinement, and a failure here must not fail the ingestion run
 * or the request that triggered it. A team whose scores are stale or missing simply falls back to the
 * item's platform-wide baseline, which is the pre-existing behavior.
 */
export const upsertTeamScores = async (teamId: string, items: ScorableItem[]): Promise<number> => {
  if (items.length === 0) return 0;

  try {
    const pool = await fetchTeamBrandVoicePool(teamId);
    if (pool.length === 0) return 0;

    const now = new Date();
    const ops = items.flatMap((item) => {
      const scored = scoreItemForPool(item, pool);
      if (!scored) return [];
      return [
        {
          updateOne: {
            filter: { news_item_id: item._id, team_id: teamId },
            update: { $set: { ...scored, computed_at: now } },
            upsert: true,
          },
        },
      ];
    });

    if (ops.length === 0) return 0;
    await NewsItemTeamScore.bulkWrite(ops, { ordered: false });
    return ops.length;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, teamId },
      '[NewsItemTeamScore] failed to upsert team scores',
    );
    return 0;
  }
};

/** Scores a freshly-ingested batch for every team that has a brand voice. Never throws. */
export const scoreItemsForAllTeams = async (items: ScorableItem[]): Promise<{ teams: number; rows: number }> => {
  if (items.length === 0) return { teams: 0, rows: 0 };

  try {
    const teamIds = await teamsWithBrandVoice();
    let rows = 0;
    // Sequential, not Promise.all: each team re-reads its own pool, and the whole point of this job
    // is to stay cheap. Team count is small and this runs off the request path.
    for (const teamId of teamIds) {
      rows += await upsertTeamScores(teamId, items);
    }
    return { teams: teamIds.length, rows };
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      '[NewsItemTeamScore] failed to score items for teams',
    );
    return { teams: 0, rows: 0 };
  }
};

/**
 * Recomputes one team's scores across its whole active window. Called when a team's brand voice
 * changes — adding or removing an example moves the pool every score was measured against, so every
 * score is stale until this runs.
 *
 * Fire-and-forget at its call sites: a brand-voice write must succeed even if rescoring doesn't.
 */
export const rescoreTeam = async (teamId: string): Promise<number> => {
  try {
    const items = await NewsItem.find({ lifecycle: { $ne: 'archived' } }, SCORING_PROJECTION).lean<ScorableItem[]>();
    const rows = await upsertTeamScores(teamId, items);
    logger.info(`[NewsItemTeamScore] rescored ${rows} items for team ${teamId}`);
    return rows;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, teamId },
      '[NewsItemTeamScore] rescoreTeam failed',
    );
    return 0;
  }
};

export interface TeamScore {
  relevance_score: number;
  opportunity_score: number;
}

/** Scores for one page of feed results, keyed by item id string. Never throws. */
export const fetchScoresForItems = async (
  itemIds: string[],
  teamId: string,
): Promise<Map<string, TeamScore>> => {
  const byItem = new Map<string, TeamScore>();
  if (itemIds.length === 0) return byItem;

  try {
    const rows = await NewsItemTeamScore.find(
      { team_id: teamId, news_item_id: { $in: itemIds.map((id) => new Types.ObjectId(id)) } },
      { news_item_id: 1, relevance_score: 1, opportunity_score: 1 },
    ).lean();

    for (const row of rows) {
      byItem.set(row.news_item_id.toString(), {
        relevance_score: row.relevance_score,
        opportunity_score: row.opportunity_score,
      });
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, teamId },
      '[NewsItemTeamScore] score lookup failed — falling back to the platform baseline',
    );
  }
  return byItem;
};

/** Drops score rows for deleted items. Called by the retention job's hard-delete step. */
export const deleteScoresForItems = async (itemIds: Types.ObjectId[]): Promise<void> => {
  if (itemIds.length === 0) return;
  try {
    await NewsItemTeamScore.deleteMany({ news_item_id: { $in: itemIds } });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      '[NewsItemTeamScore] failed to delete scores for removed items',
    );
  }
};

/**
 * Ranks items by *this team's* opportunity score, in the database.
 *
 * This has to be a database sort, not a re-sort of the page we already fetched: `-opportunity_score`
 * is the feed's default sort (see the frontend's `DEFAULT_FEED_SORT`), and reordering only the rows
 * that a baseline-ordered query happened to return would produce a page that is internally sorted but
 * globally wrong — page 2 could contain items that belong on page 1.
 *
 * Returns ids only. The caller re-fetches full documents so everything downstream keeps working with
 * hydrated mongoose docs (`withTeamView` calls `toObject()`), rather than with the plain objects an
 * aggregation yields.
 *
 * `filter` is lifted off the QueryBuilder-built query via `getFilter()` — the same source
 * `countTotal()` uses — so the search, allowlisted filters and subscription clause can never drift
 * between this path and the ordinary one.
 */
export const rankItemIdsForTeam = async (
  filter: Record<string, unknown>,
  teamId: string,
  skip: number,
  limit: number,
  descending: boolean,
): Promise<Types.ObjectId[]> => {
  const rows = await NewsItem.aggregate<{ _id: Types.ObjectId }>([
    { $match: filter },
    {
      $lookup: {
        from: 'news_item_team_scores',
        let: { itemId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$news_item_id', '$$itemId'] }, { $eq: ['$team_id', teamId] }] } } },
          { $project: { opportunity_score: 1 } },
        ],
        as: 'team_score',
      },
    },
    {
      $addFields: {
        // Falls back to the stored baseline for any item this team has no score for — a brand-new
        // item scored before the team existed, or a cold-start team. Without the fallback those
        // items would sort as null and clump at one end regardless of how good they are.
        effective_opportunity: {
          $ifNull: [{ $arrayElemAt: ['$team_score.opportunity_score', 0] }, { $ifNull: ['$opportunity_score', 0] }],
        },
      },
    },
    { $sort: { effective_opportunity: descending ? -1 : 1, created_at: -1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);

  return rows.map((r) => r._id);
};

/**
 * Counts items whose *effective* opportunity for this team clears `minOpportunity`. Shares
 * `rankItemIdsForTeam`'s lookup-and-coalesce shape so a stat and the feed can never disagree about
 * which items are "high opportunity".
 */
export const countAboveOpportunityForTeam = async (
  filter: Record<string, unknown>,
  teamId: string,
  minOpportunity: number,
): Promise<number> => {
  const rows = await NewsItem.aggregate<{ count: number }>([
    { $match: filter },
    {
      $lookup: {
        from: 'news_item_team_scores',
        let: { itemId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$news_item_id', '$$itemId'] }, { $eq: ['$team_id', teamId] }] } } },
          { $project: { opportunity_score: 1 } },
        ],
        as: 'team_score',
      },
    },
    {
      $addFields: {
        effective_opportunity: {
          $ifNull: [{ $arrayElemAt: ['$team_score.opportunity_score', 0] }, { $ifNull: ['$opportunity_score', 0] }],
        },
      },
    },
    { $match: { effective_opportunity: { $gte: minOpportunity } } },
    { $count: 'count' },
  ]);

  return rows[0]?.count ?? 0;
};

export const NewsItemTeamScoreService = {
  fetchTeamBrandVoicePool,
  teamsWithBrandVoice,
  scoreItemForPool,
  upsertTeamScores,
  scoreItemsForAllTeams,
  rescoreTeam,
  fetchScoresForItems,
  rankItemIdsForTeam,
  countAboveOpportunityForTeam,
  deleteScoresForItems,
  SCORING_PROJECTION,
};
