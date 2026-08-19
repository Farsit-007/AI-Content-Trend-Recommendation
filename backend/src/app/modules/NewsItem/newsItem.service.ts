import config from '../../config';
import { logger } from '../../lib/logger';
import QueryBuilder from '../../builder/QueryBuilder';
import { embedForTask } from '../../lib/modelResolution';
import { IRequestUser } from '../User/user.interface';
import { recordTombstones } from '../NewsDedupLedger/newsDedupLedger.service';
import { NewsItemCategoryOverrideService } from '../NewsItemCategoryOverride/newsItemCategoryOverride.service';
import { NewsItemTeamScoreService } from '../NewsItemTeamScore/newsItemTeamScore.service';
import { Team } from '../Team/team.model';
import { TeamService } from '../Team/team.service';
import { INewsItem } from './newsItem.interface';
import { NewsItem } from './newsItem.model';
import { findSemanticallyRelevantItems } from './newsItem.semanticMatch';
import {
  newsItemDefaultSort,
  newsItemFilterableFields,
  newsItemSearchableFields,
  newsItemSortableFields,
} from './newsItem.utils';

const HIGH_OPPORTUNITY_THRESHOLD = 7.5;

/**
 * Resolves the scores a given team actually sees, without mutating the stored document.
 *
 * Three sources, in strict precedence:
 *  1. a manual per-team override (`news_item_category_overrides`) — a human said so;
 *  2. this team's computed score (`news_item_team_scores`) — measured against *its own* brand voice;
 *  3. the item's stored value — the platform-wide baseline, scored against every team's voice pooled
 *     together. Correct only for a single-team deployment, so it is the last resort: it applies to
 *     anonymous reads, and to a team that has no brand voice yet (cold start) and therefore has no
 *     score of its own to prefer.
 */
const withTeamView = (
  item: InstanceType<typeof NewsItem>,
  override?: { category?: string; opportunity_score?: number },
  teamScore?: { relevance_score: number; opportunity_score: number },
) => {
  const plain = item.toObject();

  const relevance_score = teamScore?.relevance_score ?? plain.relevance_score;
  const opportunity_score = override?.opportunity_score ?? teamScore?.opportunity_score ?? plain.opportunity_score;

  return {
    ...plain,
    category: override?.category ?? plain.category,
    relevance_score,
    opportunity_score,
    is_overridden: Boolean(override),
    /** Which of the three sources supplied `opportunity_score` — lets the UI explain a ranking. */
    score_source: override?.opportunity_score !== undefined ? ('override' as const)
      : teamScore ? ('team' as const)
      : ('baseline' as const),
  };
};

/** The raw embedding vector is never useful to a client and is dropped from every response. */
const omitEmbedding = <T extends Record<string, unknown>>(plain: T): Omit<T, 'embedding'> => {
  const { embedding, ...rest } = plain;
  return rest;
};

/** List responses additionally drop `content` (only the detail endpoint needs the full text) to keep list payloads light. */
const omitListOnlyFields = <T extends Record<string, unknown>>(plain: T): Omit<T, 'embedding' | 'content'> => {
  const { embedding, content, ...rest } = plain;
  return rest;
};

const createNewsItem = async (payload: Partial<INewsItem>) => {
  const embedding =
    payload.embedding ?? (await embedForTask('embedding', `${payload.title ?? ''} ${payload.snippet ?? ''}`.trim()));
  const result = await NewsItem.create({ ...payload, embedding });
  return result;
};

const getAllNewsItems = async (query: Record<string, unknown>, requestingUser?: IRequestUser) => {
  const { team_id: queryTeamId, ...remainingQuery } = query as { team_id?: string } & Record<string, unknown>;

  const teamId = queryTeamId ?? (requestingUser?.team_ids[0]);

  // A team that hasn't told us what it cares about (categories) or what it sounds like (brand
  // voice) sees an explicit "not ready" empty state instead of the unfiltered global pool — see
  // team-readiness. Only applies when a team context actually resolved; unauthenticated/no-team
  // requests are unaffected.
  if (teamId && !(await TeamService.isTeamReady(teamId))) {
    const meta = {
      page: Number(remainingQuery.page) || 1,
      limit: Number(remainingQuery.limit) || 10,
      total: 0,
      totalPage: 0,
    };
    return { meta, result: [], team_ready: false };
  }

  // Base filter, not folded into `remainingQuery`: an explicit `?lifecycle=` still needs to flow
  // through QueryBuilder.filter() untouched (e.g. the `?lifecycle=archived` admin escape hatch),
  // so the exclusion is only added here when the caller didn't ask for a specific lifecycle.
  const baseFilter = remainingQuery.lifecycle ? {} : { lifecycle: { $ne: 'archived' } };

  const newsItemQuery = new QueryBuilder(NewsItem.find(baseFilter), remainingQuery, {
    searchableFields: newsItemSearchableFields,
    filterableFields: newsItemFilterableFields,
    sortableFields: newsItemSortableFields,
    defaultSort: newsItemDefaultSort,
  })
    .search()
    .filter()
    .sort()
    .paginate();

  // Auto-apply the team's category subscription only when the caller didn't already ask for a specific
  // category — an explicit `?category=` always wins over the team's standing preference.
  // Matches on exact category OR the item's broad group (category_group) being subscribed to —
  // e.g. subscribing to the broad group "AI" also surfaces a fine-grained discovered category like
  // "LLM Tooling" whose category_group is "AI", not only items literally categorized "AI". See
  // flexible-news-taxonomy-and-relevance.
  let subscribedCategories: string[] = [];
  if (teamId && !remainingQuery.category) {
    try {
      const team = await Team.findById(teamId).select('subscribed_categories');
      if (team?.subscribed_categories.length) {
        subscribedCategories = team.subscribed_categories;
        newsItemQuery.modelQuery = newsItemQuery.modelQuery.find({
          $or: [
            { category: { $in: subscribedCategories } },
            { category_group: { $in: subscribedCategories } },
          ],
        });
      }
    } catch {
      // non-fatal — fall back to the unfiltered feed
    }
  }

  // `countTotal()` first: it yields the resolved (clamped) page/limit that the ranked path below
  // needs for its own skip/limit, so the two can never disagree about page size.
  const meta = await newsItemQuery.countTotal();

  // Opportunity is the feed's default sort, and it is the one sort whose values are per-team, so it
  // cannot be served by the ordinary query — see `rankIdsByTeamOpportunity`. Every other sort is on a
  // field the shared document owns and takes the normal path unchanged.
  const requestedSort = typeof remainingQuery.sort === 'string' ? remainingQuery.sort : '';
  const opportunityTerm = requestedSort
    .split(/[\s,]+/)
    .find((term) => term.replace(/^-/, '') === 'opportunity_score');

  let primaryResult;
  if (teamId && opportunityTerm) {
    const rankedIds = await NewsItemTeamScoreService.rankItemIdsForTeam(
      newsItemQuery.modelQuery.getFilter(),
      teamId,
      (meta.page - 1) * meta.limit,
      meta.limit,
      opportunityTerm.startsWith('-'),
    );
    const docs = await NewsItem.find({ _id: { $in: rankedIds } });
    // `$in` does not preserve the ranked order, so restore it rather than serving a page whose rows
    // are the right ones in the wrong sequence.
    const byId = new Map(docs.map((d) => [d._id.toString(), d]));
    primaryResult = rankedIds.map((id) => byId.get(id.toString())).filter((d): d is NonNullable<typeof d> => Boolean(d));
  } else {
    primaryResult = await newsItemQuery.modelQuery;
  }

  // Semantic "nearly relevant" tier (flexible-news-taxonomy-and-relevance) — ready-but-inactive by
  // default (config.news_feed.semantic_match_enabled), see config/index.ts for why. Only fills the
  // remaining room on this page below the requested limit, so it never displaces an exact/group
  // match; `meta.total` intentionally still reflects only the exact/group match count, not these
  // supplementary items — a documented simplification (see design.md) rather than a full
  // aggregation-based pagination rewrite.
  const semanticMatchIds = new Set<string>();
  let result: (typeof primaryResult)[number][] = primaryResult;
  if (
    teamId &&
    !remainingQuery.category &&
    config.news_feed.semantic_match_enabled &&
    subscribedCategories.length > 0 &&
    primaryResult.length < meta.limit
  ) {
    try {
      const candidates = await findSemanticallyRelevantItems(
        teamId,
        subscribedCategories,
        primaryResult.map((item) => item._id.toString()),
        meta.limit - primaryResult.length,
        config.news_feed.semantic_match_threshold,
      );
      if (candidates.length > 0) {
        const extraItems = await NewsItem.find({ _id: { $in: candidates.map((c) => c._id) } });
        for (const item of extraItems) semanticMatchIds.add(item._id.toString());
        result = [...primaryResult, ...extraItems];
      }
    } catch (err) {
      // Non-fatal — the semantic tier is a supplementary nice-to-have, never a hard requirement.
      // Common cause: `news_items_vector_index` doesn't exist yet on this deployment's cluster.
      logger.warn(
        { err: err instanceof Error ? err.message : err, teamId },
        '[NewsItem] semantic match tier failed — serving exact/group match results only',
      );
    }
  }

  const annotate = (plain: ReturnType<typeof withTeamView>) => {
    if (!teamId) return plain;

    // Reads the resolved, team-aware score `withTeamView` produced — so the badge agrees with the
    // number shown next to it and with the order the page was ranked in.
    const high_opportunity = (plain.opportunity_score ?? 0) >= HIGH_OPPORTUNITY_THRESHOLD;
    const match_reason = semanticMatchIds.has(String(plain._id)) ? ('semantic' as const) : undefined;

    return { ...plain, high_opportunity, ...(match_reason ? { match_reason } : {}) };
  };

  const teamReady = teamId ? true : undefined;
  const itemIds = result.map((item) => item._id.toString());

  // Scores for the resolved team. Fetched even when the caller didn't sort by opportunity, because
  // the displayed relevance/opportunity and the high-opportunity badge must reflect this team's view
  // on every read, not just on a ranked one.
  const scoresByItem = teamId
    ? await NewsItemTeamScoreService.fetchScoresForItems(itemIds, teamId)
    : new Map<string, { relevance_score: number; opportunity_score: number }>();

  if (!requestingUser || requestingUser.team_ids.length === 0) {
    return {
      meta,
      result: result.map((item) =>
        omitListOnlyFields(annotate(withTeamView(item, undefined, scoresByItem.get(item._id.toString())))),
      ),
      team_ready: teamReady,
    };
  }

  const overridesByItem = await NewsItemCategoryOverrideService.fetchOverridesForItems(
    itemIds,
    requestingUser.team_ids,
  );
  return {
    meta,
    result: result.map((item) =>
      omitListOnlyFields(
        annotate(
          withTeamView(item, overridesByItem.get(item._id.toString()), scoresByItem.get(item._id.toString())),
        ),
      ),
    ),
    team_ready: teamReady,
  };
};

const getSingleNewsItem = async (id: string, requestingUser?: IRequestUser) => {
  // Intentionally unfiltered by lifecycle: archived is not the same as hidden-by-id — old
  // generated content links to archived items and must keep resolving until hard delete.
  const result = await NewsItem.findById(id);
  if (!result) return null;

  if (!requestingUser || requestingUser.team_ids.length === 0) {
    return omitEmbedding(withTeamView(result));
  }

  const itemId = result._id.toString();
  const teamId = requestingUser.team_ids[0];
  const [overridesByItem, scoresByItem] = await Promise.all([
    NewsItemCategoryOverrideService.fetchOverridesForItems([itemId], requestingUser.team_ids),
    NewsItemTeamScoreService.fetchScoresForItems([itemId], teamId),
  ]);
  return omitEmbedding(withTeamView(result, overridesByItem.get(itemId), scoresByItem.get(itemId)));
};

const updateNewsItem = async (id: string, payload: Partial<INewsItem>) => {
  // `current_trend_score` is system-maintained (ingest + refresh job only); the validation
  // middleware doesn't strip unvalidated fields from req.body, so guard it here explicitly.
  const { current_trend_score: _currentTrendScore, ...safePayload } = payload;

  // Restoring an item must not leave stale archive metadata behind.
  const update: Partial<INewsItem> & { $unset?: Record<string, 1> } =
    safePayload.lifecycle === 'active' ? { ...safePayload, $unset: { archived_at: 1, archive_reason: 1 } } : safePayload;

  const result = await NewsItem.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deleteNewsItem = async (id: string) => {
  const item = await NewsItem.findById(id, { content_hash: 1, title: 1, source: 1 });
  if (!item) return null;

  // Tombstone-before-delete is the invariant (design.md decision 1 of dedup-tombstone-ledger):
  // a crash between these two steps leaves a harmless extra tombstone, never a resurrection window.
  await recordTombstones([{ content_hash: item.content_hash, title: item.title, source: item.source }]);

  const result = await NewsItem.findByIdAndDelete(id);
  return result;
};

export const NewsItemService = {
  createNewsItem,
  getAllNewsItems,
  getSingleNewsItem,
  updateNewsItem,
  deleteNewsItem,
};
