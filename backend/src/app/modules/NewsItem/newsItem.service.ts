import QueryBuilder from '../../builder/QueryBuilder';
import { embed } from '../../lib/embeddings';
import { IRequestUser } from '../User/user.interface';
import { recordTombstones } from '../NewsDedupLedger/newsDedupLedger.service';
import { NewsItemCategoryOverrideService } from '../NewsItemCategoryOverride/newsItemCategoryOverride.service';
import { Team } from '../Team/team.model';
import { INewsItem } from './newsItem.interface';
import { NewsItem } from './newsItem.model';
import { newsItemSearchableFields } from './newsItem.utils';

const HIGH_OPPORTUNITY_THRESHOLD = 7.5;

/** Splices in the requesting user's team override (if any) without mutating the stored document. */
const withOverride = (item: InstanceType<typeof NewsItem>, override?: { category?: string; opportunity_score?: number }) => {
  const plain = item.toObject();
  if (!override) {
    return { ...plain, is_overridden: false };
  }
  return {
    ...plain,
    category: override.category ?? plain.category,
    opportunity_score: override.opportunity_score ?? plain.opportunity_score,
    is_overridden: true,
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
  const embedding = payload.embedding ?? (await embed(`${payload.title ?? ''} ${payload.snippet ?? ''}`.trim()));
  const result = await NewsItem.create({ ...payload, embedding });
  return result;
};

const getAllNewsItems = async (query: Record<string, unknown>, requestingUser?: IRequestUser) => {
  const { team_id: queryTeamId, ...remainingQuery } = query as { team_id?: string } & Record<string, unknown>;

  // QueryBuilder.sort()'s own default (`-createdAt`) references a field that doesn't exist on
  // this schema, so it never does anything — inject the real default here, before QueryBuilder
  // sees the query, so an explicit `?sort=` still wins unchanged.
  if (!remainingQuery.sort) {
    remainingQuery.sort = '-current_trend_score -created_at';
  }

  // Base filter, not folded into `remainingQuery`: an explicit `?lifecycle=` still needs to flow
  // through QueryBuilder.filter() untouched (e.g. the `?lifecycle=archived` admin escape hatch),
  // so the exclusion is only added here when the caller didn't ask for a specific lifecycle.
  const baseFilter = remainingQuery.lifecycle ? {} : { lifecycle: { $ne: 'archived' } };

  const newsItemQuery = new QueryBuilder(NewsItem.find(baseFilter), remainingQuery)
    .search(newsItemSearchableFields)
    .filter()
    .sort()
    .paginate();

  const teamId = queryTeamId ?? (requestingUser?.team_ids[0]);

  // Auto-apply the team's category subscription only when the caller didn't already ask for a specific
  // category — an explicit `?category=` always wins over the team's standing preference.
  if (teamId && !remainingQuery.category) {
    try {
      const team = await Team.findById(teamId).select('subscribed_categories');
      if (team?.subscribed_categories.length) {
        newsItemQuery.modelQuery = newsItemQuery.modelQuery.find({
          category: { $in: team.subscribed_categories },
        });
      }
    } catch {
      // non-fatal — fall back to the unfiltered feed
    }
  }

  const result = await newsItemQuery.modelQuery;
  const meta = await newsItemQuery.countTotal();

  const annotate = (plain: ReturnType<typeof withOverride>) => {
    if (!teamId) return plain;

    const high_opportunity = (plain.opportunity_score ?? 0) >= HIGH_OPPORTUNITY_THRESHOLD;

    return { ...plain, high_opportunity };
  };

  if (!requestingUser || requestingUser.team_ids.length === 0) {
    return { meta, result: result.map((item) => omitListOnlyFields(annotate(withOverride(item)))) };
  }

  const overridesByItem = await NewsItemCategoryOverrideService.fetchOverridesForItems(
    result.map((item) => item._id.toString()),
    requestingUser.team_ids,
  );
  return {
    meta,
    result: result.map((item) =>
      omitListOnlyFields(annotate(withOverride(item, overridesByItem.get(item._id.toString())))),
    ),
  };
};

const getSingleNewsItem = async (id: string, requestingUser?: IRequestUser) => {
  // Intentionally unfiltered by lifecycle: archived is not the same as hidden-by-id — old
  // generated content links to archived items and must keep resolving until hard delete.
  const result = await NewsItem.findById(id);
  if (!result) return null;

  if (!requestingUser || requestingUser.team_ids.length === 0) {
    return omitEmbedding(withOverride(result));
  }

  const overridesByItem = await NewsItemCategoryOverrideService.fetchOverridesForItems(
    [result._id.toString()],
    requestingUser.team_ids,
  );
  return omitEmbedding(withOverride(result, overridesByItem.get(result._id.toString())));
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
