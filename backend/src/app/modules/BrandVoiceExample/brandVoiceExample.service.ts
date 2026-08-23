import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { invalidate } from '../../lib/cache';
import { embedForTask } from '../../lib/modelResolution';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { IBrandVoiceExample } from './brandVoiceExample.interface';
import { BrandVoiceExample } from './brandVoiceExample.model';
import { NewsItemTeamScoreService } from '../NewsItemTeamScore/newsItemTeamScore.service';
import {
  brandVoiceExampleDefaultSort,
  brandVoiceExampleFilterableFields,
  brandVoiceExampleSearchableFields,
  brandVoiceExampleSortableFields,
} from './brandVoiceExample.utils';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const createBrandVoiceExample = async (payload: Partial<IBrandVoiceExample>, requestingUser: IRequestUser) => {
  assertTeamAccess(payload.team_id as string, requestingUser);

  const embedding =
    payload.embedding ?? (await embedForTask('embedding', payload.content as string, { teamId: payload.team_id }));
  const result = await BrandVoiceExample.create({ ...payload, embedding });
  // Readiness is derived from whether this team has *any* example, so the first one flips it.
  // Awaited, unlike the rescore below: the user's next request is the feed reload that would
  // otherwise still show the not-ready empty state they just resolved.
  await invalidate('team:ready', payload.team_id as string);
  // Every one of this team's news scores was measured against the pool this example just changed, so
  // they are all stale. Fire-and-forget: the example is saved either way, and a stale score degrades
  // to the platform baseline rather than breaking anything.
  void NewsItemTeamScoreService.rescoreTeam(payload.team_id as string);
  return result;
};

const getAllBrandVoiceExamples = async (query: Record<string, unknown>, requestingUser: IRequestUser) => {
  const brandVoiceExampleQuery = new QueryBuilder(BrandVoiceExample.find(), query, {
    searchableFields: brandVoiceExampleSearchableFields,
    filterableFields: brandVoiceExampleFilterableFields,
    sortableFields: brandVoiceExampleSortableFields,
    defaultSort: brandVoiceExampleDefaultSort,
  })
    .search()
    .filter()
    .sort()
    .paginate();

  if (requestingUser.role !== 'super_admin') {
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
  if (requestingUser.role !== 'super_admin' && !requestingUser.team_ids.includes(result.team_id)) {
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
  if (result) void NewsItemTeamScoreService.rescoreTeam(result.team_id);
  return result;
};

const deleteBrandVoiceExample = async (id: string, requestingUser: IRequestUser) => {
  const existing = await getSingleBrandVoiceExample(id, requestingUser);
  if (!existing) return null;

  const result = await BrandVoiceExample.findByIdAndDelete(id);
  if (result) {
    // Removing the last example flips readiness back off.
    await invalidate('team:ready', result.team_id);
    void NewsItemTeamScoreService.rescoreTeam(result.team_id);
  }
  return result;
};

export const BrandVoiceExampleService = {
  createBrandVoiceExample,
  getAllBrandVoiceExamples,
  getSingleBrandVoiceExample,
  updateBrandVoiceExample,
  deleteBrandVoiceExample,
};
