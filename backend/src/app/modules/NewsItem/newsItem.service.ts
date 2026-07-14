import QueryBuilder from '../../builder/QueryBuilder';
import { embed } from '../../lib/embeddings';
import { IRequestUser } from '../User/user.interface';
import { NewsItemCategoryOverrideService } from '../NewsItemCategoryOverride/newsItemCategoryOverride.service';
import { INewsItem } from './newsItem.interface';
import { NewsItem } from './newsItem.model';
import { newsItemSearchableFields } from './newsItem.utils';

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

const createNewsItem = async (payload: Partial<INewsItem>) => {
  const embedding = payload.embedding ?? (await embed(`${payload.title ?? ''} ${payload.snippet ?? ''}`.trim()));
  const result = await NewsItem.create({ ...payload, embedding });
  return result;
};

const getAllNewsItems = async (query: Record<string, unknown>, requestingUser?: IRequestUser) => {
  const newsItemQuery = new QueryBuilder(NewsItem.find(), query)
    .search(newsItemSearchableFields)
    .filter()
    .sort()
    .paginate();

  const result = await newsItemQuery.modelQuery;
  const meta = await newsItemQuery.countTotal();

  if (!requestingUser || requestingUser.team_ids.length === 0) {
    return { meta, result: result.map((item) => withOverride(item)) };
  }

  const overridesByItem = await NewsItemCategoryOverrideService.fetchOverridesForItems(
    result.map((item) => item._id.toString()),
    requestingUser.team_ids,
  );
  return {
    meta,
    result: result.map((item) => withOverride(item, overridesByItem.get(item._id.toString()))),
  };
};

const getSingleNewsItem = async (id: string, requestingUser?: IRequestUser) => {
  const result = await NewsItem.findById(id);
  if (!result) return null;

  if (!requestingUser || requestingUser.team_ids.length === 0) {
    return withOverride(result);
  }

  const overridesByItem = await NewsItemCategoryOverrideService.fetchOverridesForItems(
    [result._id.toString()],
    requestingUser.team_ids,
  );
  return withOverride(result, overridesByItem.get(result._id.toString()));
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
