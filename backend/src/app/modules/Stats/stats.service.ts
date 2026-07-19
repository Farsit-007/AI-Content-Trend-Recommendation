import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { GeneratedContent } from '../GeneratedContent/generatedContent.model';
import { IngestionRun } from '../IngestionRun/ingestionRun.model';
import { IngestionRunService } from '../IngestionRun/ingestionRun.service';
import { NewsItem } from '../NewsItem/newsItem.model';
import { StylePack } from '../StylePack/stylePack.model';
import { Team, TeamMembership } from '../Team/team.model';
import { User } from '../User/user.model';
import { IRequestUser, UserRole } from '../User/user.interface';

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_OPPORTUNITY_THRESHOLD = 7.5;

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const getTeamStats = async (teamId: string) => {
  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError(httpStatus.NOT_FOUND, 'Team not found');
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

  const [
    membersCount,
    draftCounts,
    brandVoiceCount,
    recentDrafts,
    highOpportunityCount,
  ] = await Promise.all([
    TeamMembership.countDocuments({ team_id: teamId }),
    GeneratedContent.aggregate<{ _id: string; count: number }>([
      { $match: { team_id: teamId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BrandVoiceExample.countDocuments({ team_id: teamId }),
    GeneratedContent.find({ team_id: teamId })
      .sort({ created_at: -1 })
      .limit(5)
      .select('topic status source created_at')
      .lean(),
    NewsItem.countDocuments({
      lifecycle: { $ne: 'archived' },
      opportunity_score: { $gte: HIGH_OPPORTUNITY_THRESHOLD },
      created_at: { $gte: sevenDaysAgo },
      ...(team.subscribed_categories.length ? { category: { $in: team.subscribed_categories } } : {}),
    }),
  ]);

  const counts = { draft: 0, approved: 0, dismissed: 0 };
  for (const row of draftCounts) {
    if (row._id in counts) counts[row._id as keyof typeof counts] = row.count;
  }

  return {
    team_id: teamId,
    team_name: team.name,
    members_count: membersCount,
    drafts: {
      draft: counts.draft,
      approved: counts.approved,
      dismissed: counts.dismissed,
      total: counts.draft + counts.approved + counts.dismissed,
    },
    brand_voice_examples_count: brandVoiceCount,
    is_cold_start: brandVoiceCount === 0,
    subscribed_categories: team.subscribed_categories,
    high_opportunity_items_count: highOpportunityCount,
    recent_drafts: recentDrafts.map((d) => ({
      _id: d._id.toString(),
      topic: d.topic,
      status: d.status,
      source: d.source,
      created_at: d.created_at,
    })),
  };
};

const getSystemStats = async () => {
  const oneDayAgo = new Date(Date.now() - DAY_MS);

  const [
    totalNewsItems,
    newsItemsLast24h,
    totalTeams,
    usersByRoleAgg,
    draftsByStatusAgg,
    totalStylePacks,
    activeStylePacks,
    lastIngestionRun,
    recentRuns,
  ] = await Promise.all([
    NewsItem.countDocuments({ lifecycle: { $ne: 'archived' } }),
    NewsItem.countDocuments({ created_at: { $gte: oneDayAgo } }),
    Team.countDocuments(),
    User.aggregate<{ _id: UserRole; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    GeneratedContent.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    StylePack.countDocuments(),
    StylePack.countDocuments({ is_active: true }),
    IngestionRun.findOne().sort({ started_at: -1 }).select('started_at total_stored trigger').lean(),
    IngestionRun.find().sort({ started_at: -1 }).limit(20).lean(),
  ]);

  const usersByRole = { user: 0, admin: 0, super_admin: 0 };
  for (const row of usersByRoleAgg) {
    if (row._id in usersByRole) usersByRole[row._id] = row.count;
  }

  const draftsByStatus = { draft: 0, approved: 0, dismissed: 0 };
  for (const row of draftsByStatusAgg) {
    if (row._id in draftsByStatus) draftsByStatus[row._id as keyof typeof draftsByStatus] = row.count;
  }

  const sourceHealth = IngestionRunService.computeZeroStreaks(recentRuns as never);
  const alertingSourcesCount = sourceHealth.filter((s) => s.alert).length;

  return {
    total_news_items: totalNewsItems,
    news_items_last_24h: newsItemsLast24h,
    total_teams: totalTeams,
    total_users: usersByRole.user + usersByRole.admin + usersByRole.super_admin,
    users_by_role: usersByRole,
    total_drafts: draftsByStatus.draft + draftsByStatus.approved + draftsByStatus.dismissed,
    drafts_by_status: draftsByStatus,
    total_style_packs: totalStylePacks,
    active_style_packs: activeStylePacks,
    last_ingestion_run: lastIngestionRun
      ? {
          started_at: lastIngestionRun.started_at,
          total_stored: lastIngestionRun.total_stored,
          trigger: lastIngestionRun.trigger,
        }
      : null,
    alerting_sources_count: alertingSourcesCount,
  };
};

const getOverview = async (teamId: string | undefined, requestingUser: IRequestUser) => {
  const isElevated = requestingUser.role === 'super_admin';
  const resolvedTeamId = teamId ?? requestingUser.team_ids[0];

  if (resolvedTeamId) {
    assertTeamAccess(resolvedTeamId, requestingUser);
  }

  const [team, system] = await Promise.all([
    resolvedTeamId ? getTeamStats(resolvedTeamId) : null,
    isElevated ? getSystemStats() : null,
  ]);

  return { team, system };
};

export const StatsService = {
  getOverview,
};
