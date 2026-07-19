import AppError from '../../errors/AppError';
import { logger } from '../../lib/logger';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { ActivityAction, IActivityLogEntry } from './activityLog.interface';
import { ActivityLogEntry } from './activityLog.model';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

export interface RecordActivityInput {
  team_id: string;
  actor: IRequestUser;
  action: ActivityAction;
  summary: string;
  target_type?: IActivityLogEntry['target_type'];
  target_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget by design: a logging failure must never fail the real action it's describing.
 * Called *after* the primary mutation has already succeeded at every call site.
 */
const recordActivity = async (input: RecordActivityInput): Promise<void> => {
  try {
    await ActivityLogEntry.create({
      team_id: input.team_id,
      actor_id: input.actor.id,
      actor_name: input.actor.name,
      actor_email: input.actor.email,
      action: input.action,
      summary: input.summary,
      target_type: input.target_type,
      target_id: input.target_id,
      metadata: input.metadata,
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, `[ActivityLog] failed to record "${input.action}" for team ${input.team_id}`);
  }
};

const listActivity = async (
  teamId: string,
  query: { action?: string; page?: string; limit?: string },
  requestingUser: IRequestUser,
) => {
  assertTeamAccess(teamId, requestingUser);

  const filter: Record<string, unknown> = { team_id: teamId };
  if (query.action) filter.action = query.action;

  const page = Math.max(1, parseInt(query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '30', 10)));
  const skip = (page - 1) * limit;

  const [result, total] = await Promise.all([
    ActivityLogEntry.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    ActivityLogEntry.countDocuments(filter),
  ]);

  return { meta: { page, limit, total, totalPage: Math.ceil(total / limit) }, result };
};

export const ActivityLogService = {
  recordActivity,
  listActivity,
};
