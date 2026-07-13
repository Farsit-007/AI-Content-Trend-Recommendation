import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { embed } from '../../lib/embeddings';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { IPlatformPost } from './platformPost.interface';
import { PlatformPost } from './platformPost.model';
import { platformPostSearchableFields } from './platformPost.utils';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const createPlatformPost = async (payload: Partial<IPlatformPost>, requestingUser: IRequestUser) => {
  assertTeamAccess(payload.team_id as string, requestingUser);

  const embedding =
    payload.embedding ?? (await embed(payload.content_snippet ?? `${payload.platform} ${payload.post_id}`));
  const result = await PlatformPost.create({ ...payload, embedding });
  return result;
};

const getAllPlatformPosts = async (query: Record<string, unknown>, requestingUser: IRequestUser) => {
  const platformPostQuery = new QueryBuilder(PlatformPost.find(), query)
    .search(platformPostSearchableFields)
    .filter()
    .sort()
    .paginate();

  if (requestingUser.role !== 'admin') {
    platformPostQuery.modelQuery = platformPostQuery.modelQuery.find({
      team_id: { $in: requestingUser.team_ids },
    });
  }

  const result = await platformPostQuery.modelQuery;
  const meta = await platformPostQuery.countTotal();
  return { meta, result };
};

const getSinglePlatformPost = async (id: string, requestingUser: IRequestUser) => {
  const result = await PlatformPost.findById(id);
  if (!result) return null;
  // Pretend it doesn't exist for a team the caller can't see — don't confirm existence.
  if (requestingUser.role !== 'admin' && !requestingUser.team_ids.includes(result.team_id)) {
    return null;
  }
  return result;
};

const updatePlatformPost = async (
  id: string,
  payload: Partial<IPlatformPost>,
  requestingUser: IRequestUser,
) => {
  const existing = await getSinglePlatformPost(id, requestingUser);
  if (!existing) return null;

  const result = await PlatformPost.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deletePlatformPost = async (id: string, requestingUser: IRequestUser) => {
  const existing = await getSinglePlatformPost(id, requestingUser);
  if (!existing) return null;

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
