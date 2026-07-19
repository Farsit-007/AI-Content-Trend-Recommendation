import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { ActivityLogService } from '../ActivityLog/activityLog.service';
import { IRequestUser } from '../User/user.interface';
import { IAutoGenerationSummary, IGeneratedContentFormats, GeneratedContentStatus } from './generatedContent.interface';
import { runAutoGeneration } from './generatedContent.job';
import { GeneratedContent } from './generatedContent.model';
import { assertHasAtLeastOneFormat } from './generatedContent.utils';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const assertAdmin = (requestingUser: IRequestUser) => {
  if (requestingUser.role !== 'super_admin') {
    throw new AppError(httpStatus.FORBIDDEN, 'Admin access required');
  }
};

const listDrafts = async (
  query: { team_id: string; status?: string; source?: string; page?: string; limit?: string },
  requestingUser: IRequestUser,
) => {
  assertTeamAccess(query.team_id, requestingUser);

  const filter: Record<string, unknown> = { team_id: query.team_id };
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;

  const page = Math.max(1, parseInt(query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
  const skip = (page - 1) * limit;

  const [result, total] = await Promise.all([
    GeneratedContent.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    GeneratedContent.countDocuments(filter),
  ]);

  return { meta: { page, limit, total, totalPage: Math.ceil(total / limit) }, result };
};

const updateStatus = async (
  id: string,
  status: GeneratedContentStatus,
  requestingUser: IRequestUser,
) => {
  const doc = await GeneratedContent.findById(id);
  if (!doc) throw new AppError(httpStatus.NOT_FOUND, 'Generated content not found');

  assertTeamAccess(doc.team_id, requestingUser);

  doc.status = status;
  doc.updated_by = requestingUser.id;
  doc.updated_by_name = requestingUser.name;
  doc.updated_at = new Date();
  await doc.save();

  if (status === 'approved' || status === 'dismissed') {
    void ActivityLogService.recordActivity({
      team_id: doc.team_id,
      actor: requestingUser,
      action: status === 'approved' ? 'content.draft_approved' : 'content.draft_dismissed',
      summary: `${status === 'approved' ? 'Approved' : 'Dismissed'} the draft "${doc.topic}"`,
      target_type: 'generated_content',
      target_id: doc._id.toString(),
    });
  }

  return doc;
};

const triggerRun = async (
  teamId: string | undefined,
  requestingUser: IRequestUser,
): Promise<IAutoGenerationSummary> => {
  assertAdmin(requestingUser);
  return runAutoGeneration(teamId);
};

const createDraft = async (
  payload: {
    team_id: string;
    news_item_id?: string;
    topic: string;
    formats: IGeneratedContentFormats;
    model_used?: string;
  },
  requestingUser: IRequestUser,
) => {
  assertTeamAccess(payload.team_id, requestingUser);
  assertHasAtLeastOneFormat(payload.formats);

  const draft = await GeneratedContent.create({
    ...payload,
    source: 'manual',
    status: 'draft',
    created_by: requestingUser.id,
    created_by_name: requestingUser.name,
  });

  void ActivityLogService.recordActivity({
    team_id: payload.team_id,
    actor: requestingUser,
    action: 'content.draft_saved',
    summary: `Saved a draft for "${payload.topic}" (${Object.keys(payload.formats).join(', ')})`,
    target_type: 'generated_content',
    target_id: draft._id.toString(),
  });

  return draft;
};

export const GeneratedContentService = {
  listDrafts,
  updateStatus,
  triggerRun,
  createDraft,
};
