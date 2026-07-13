import QueryBuilder from '../../builder/QueryBuilder';
import { embed } from '../../lib/embeddings';
import { IPlatformPost } from './platformPost.interface';
import { PlatformPost } from './platformPost.model';
import { platformPostSearchableFields } from './platformPost.utils';

const createPlatformPost = async (payload: Partial<IPlatformPost>) => {
  const embedding =
    payload.embedding ?? (await embed(payload.content_snippet ?? `${payload.platform} ${payload.post_id}`));
  const result = await PlatformPost.create({ ...payload, embedding });
  return result;
};

const getAllPlatformPosts = async (query: Record<string, unknown>) => {
  const platformPostQuery = new QueryBuilder(PlatformPost.find(), query)
    .search(platformPostSearchableFields)
    .filter()
    .sort()
    .paginate();

  const result = await platformPostQuery.modelQuery;
  const meta = await platformPostQuery.countTotal();
  return { meta, result };
};

const getSinglePlatformPost = async (id: string) => {
  const result = await PlatformPost.findById(id);
  return result;
};

const updatePlatformPost = async (id: string, payload: Partial<IPlatformPost>) => {
  const result = await PlatformPost.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deletePlatformPost = async (id: string) => {
  const result = await PlatformPost.findByIdAndDelete(id);
  return result;
};

export const PlatformPostService = {
  createPlatformPost,
  getAllPlatformPosts,
  getSinglePlatformPost,
  updatePlatformPost,
  deletePlatformPost,
};
