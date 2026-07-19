import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { ActivityLogService } from '../ActivityLog/activityLog.service';
import { NewsItem } from '../NewsItem/newsItem.model';
import { TeamService } from '../Team/team.service';
import { NewsItemCategoryOverride } from './newsItemCategoryOverride.model';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

interface OverrideInput {
  category?: string;
  opportunity_score?: number;
}

const setOverride = async (
  newsItemId: string,
  teamId: string,
  payload: OverrideInput,
  requestingUser: IRequestUser,
) => {
  assertTeamAccess(teamId, requestingUser);

  const newsItem = await NewsItem.findById(newsItemId);
  if (!newsItem) {
    throw new AppError(httpStatus.NOT_FOUND, 'News item not found');
  }

  if (payload.category !== undefined) {
    const effectiveCategories = await TeamService.getEffectiveCategories(teamId);
    if (!effectiveCategories.some((c) => c.toLowerCase() === payload.category!.toLowerCase())) {
      throw new AppError(httpStatus.BAD_REQUEST, 'category must be one of the team\'s effective categories');
    }
  }

  const result = await NewsItemCategoryOverride.findOneAndUpdate(
    { news_item_id: newsItemId, team_id: teamId },
    {
      $set: {
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.opportunity_score !== undefined ? { opportunity_score: payload.opportunity_score } : {}),
        overridden_by: requestingUser.id,
        overridden_at: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  void ActivityLogService.recordActivity({
    team_id: teamId,
    actor: requestingUser,
    action: 'news.category_corrected',
    summary: `Corrected "${newsItem.title}"${payload.category !== undefined ? ` to category "${payload.category}"` : ''}`,
    target_type: 'news_item',
    target_id: newsItemId,
  });

  return result;
};

const clearOverride = async (newsItemId: string, teamId: string, requestingUser: IRequestUser) => {
  assertTeamAccess(teamId, requestingUser);

  const result = await NewsItemCategoryOverride.findOneAndDelete({ news_item_id: newsItemId, team_id: teamId });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'No override exists for this team on this news item');
  }
  return result;
};

/** Batch-fetch overrides for a set of news items across all of a user's teams, keyed by news_item_id. */
const fetchOverridesForItems = async (
  newsItemIds: string[],
  teamIds: string[],
): Promise<Map<string, InstanceType<typeof NewsItemCategoryOverride>>> => {
  if (newsItemIds.length === 0 || teamIds.length === 0) return new Map();

  const overrides = await NewsItemCategoryOverride.find({
    news_item_id: { $in: newsItemIds },
    team_id: { $in: teamIds },
  });

  // A news item could theoretically have overrides from multiple of the user's teams;
  // first match wins since a single response can only show one effective view per item.
  const byItem = new Map<string, InstanceType<typeof NewsItemCategoryOverride>>();
  for (const override of overrides) {
    if (!byItem.has(override.news_item_id)) {
      byItem.set(override.news_item_id, override);
    }
  }
  return byItem;
};

export const NewsItemCategoryOverrideService = {
  setOverride,
  clearOverride,
  fetchOverridesForItems,
};
