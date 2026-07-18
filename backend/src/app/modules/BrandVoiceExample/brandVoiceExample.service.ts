import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { embedForTask } from '../../lib/modelResolution';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { IBrandVoiceExample } from './brandVoiceExample.interface';
import { BrandVoiceExample } from './brandVoiceExample.model';
import { brandVoiceExampleSearchableFields } from './brandVoiceExample.utils';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const createBrandVoiceExample = async (payload: Partial<IBrandVoiceExample>, requestingUser: IRequestUser) => {
  assertTeamAccess(payload.team_id as string, requestingUser);

  const embedding =
    payload.embedding ?? (await embedForTask('embedding', payload.content as string, { teamId: payload.team_id }));
  const result = await BrandVoiceExample.create({ ...payload, embedding });
  return result;
};

const getAllBrandVoiceExamples = async (query: Record<string, unknown>, requestingUser: IRequestUser) => {
  const brandVoiceExampleQuery = new QueryBuilder(BrandVoiceExample.find(), query)
    .search(brandVoiceExampleSearchableFields)
    .filter()
    .sort()
    .paginate();

  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin') {
    brandVoiceExampleQuery.modelQuery = brandVoiceExampleQuery.modelQuery.find({
      team_id: { $in: requestingUser.team_ids },
    });
  }

  const result = await brandVoiceExampleQuery.modelQuery;
  const meta = await brandVoiceExampleQuery.countTotal();
  return { meta, result };
};

const getSingleBrandVoiceExample = async (id: string, requestingUser: IRequestUser) => {
  const result = await BrandVoiceExample.findById(id);
  if (!result) return null;
  if (
    requestingUser.role !== 'admin' &&
    requestingUser.role !== 'super_admin' &&
    !requestingUser.team_ids.includes(result.team_id)
  ) {
    return null;
  }
  return result;
};

const updateBrandVoiceExample = async (
  id: string,
  payload: Partial<IBrandVoiceExample>,
  requestingUser: IRequestUser,
) => {
  const existing = await getSingleBrandVoiceExample(id, requestingUser);
  if (!existing) return null;

  const result = await BrandVoiceExample.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  return result;
};

const deleteBrandVoiceExample = async (id: string, requestingUser: IRequestUser) => {
  const existing = await getSingleBrandVoiceExample(id, requestingUser);
  if (!existing) return null;

  const result = await BrandVoiceExample.findByIdAndDelete(id);
  return result;
};

export const BrandVoiceExampleService = {
  createBrandVoiceExample,
  getAllBrandVoiceExamples,
  getSingleBrandVoiceExample,
  updateBrandVoiceExample,
  deleteBrandVoiceExample,
};
