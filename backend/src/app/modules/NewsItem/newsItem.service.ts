import QueryBuilder from '../../builder/QueryBuilder';
import { embed } from '../../lib/embeddings';
import { IRequestUser } from '../User/user.interface';
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

  const newsItemQuery = new QueryBuilder(NewsItem.find(), remainingQuery)
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
  const result = await NewsItem.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deleteNewsItem = async (id: string) => {
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
