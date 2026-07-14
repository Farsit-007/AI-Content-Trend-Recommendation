import config from '../../config';
import AppError from '../../errors/AppError';
import { redis } from '../../lib/redis';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { aggregateOverview, aggregatePlatformBreakdowns } from './report.aggregate';
import { getTopOpportunities } from './report.opportunities';
import { generateBanglishInsight } from './report.prompt';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser): void => {
  if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const buildReport = async (teamId: string) => {
  const [overview, platforms, opportunities] = await Promise.all([
    aggregateOverview(teamId),
    aggregatePlatformBreakdowns(teamId),
    getTopOpportunities(teamId),
  ]);

  const ai_insight = await generateBanglishInsight({
    overview,
    platforms,
    topOpportunity: opportunities[0] ?? null,
  });

  return { team_id: teamId, overview, platforms, opportunities, ai_insight, generated_at: new Date() };
};

export const getReport = async (
  teamId: string,
  requestingUser: IRequestUser,
  forceRefresh = false,
): Promise<object> => {
  assertTeamAccess(teamId, requestingUser);

  const cacheKey = `report:${teamId}`;

  if (!forceRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const report = await buildReport(teamId);
  await redis.setex(cacheKey, config.analytics.report_cache_ttl, JSON.stringify(report));
  return report;
};
