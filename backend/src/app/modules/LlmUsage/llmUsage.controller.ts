import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { getUsageSummary } from './llmUsage.service';

/**
 * Resolves which team's spend the caller is allowed to see.
 *
 * A super_admin may ask for any team, or omit `team_id` for a platform-wide total. Anyone else is
 * pinned to a team they belong to — and omitting `team_id` resolves to their own team rather than
 * silently widening to everyone's, which is the mistake that would turn a cost page into a data
 * leak between customers.
 */
const resolveScope = (req: Request): string | undefined => {
  const requested =
    typeof req.query.team_id === 'string' ? req.query.team_id : undefined;
  const user = req.user!;

  if (user.role === 'super_admin') return requested;

  if (requested) {
    if (!user.team_ids.includes(requested)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You do not have access to this team',
      );
    }
    return requested;
  }

  const [ownTeam] = user.team_ids;
  if (!ownTeam) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not belong to a team');
  }
  return ownTeam;
};

const getSummary = catchAsync(async (req: Request, res: Response) => {
  const result = await getUsageSummary({
    teamId: resolveScope(req),
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM usage summary retrieved successfully',
    data: result,
  });
});

export const LlmUsageController = {
  getSummary,
};
