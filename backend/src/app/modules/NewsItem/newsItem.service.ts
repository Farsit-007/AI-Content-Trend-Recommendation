import QueryBuilder from '../../builder/QueryBuilder';
import { embed } from '../../lib/embeddings';
import { INewsItem } from './newsItem.interface';
import { NewsItem } from './newsItem.model';
import { newsItemSearchableFields } from './newsItem.utils';

const createNewsItem = async (payload: Partial<INewsItem>) => {
  const embedding = payload.embedding ?? (await embed(`${payload.title ?? ''} ${payload.snippet ?? ''}`.trim()));
  const result = await NewsItem.create({ ...payload, embedding });
  return result;
};

const getAllNewsItems = async (query: Record<string, unknown>) => {
  const newsItemQuery = new QueryBuilder(NewsItem.find(), query)
    .search(newsItemSearchableFields)
    .filter()
    .sort()
    .paginate();

  const result = await newsItemQuery.modelQuery;
  const meta = await newsItemQuery.countTotal();
  return { meta, result };
};

const getSingleNewsItem = async (id: string) => {
  const result = await NewsItem.findById(id);
  return result;
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
