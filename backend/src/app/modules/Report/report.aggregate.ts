import { AnalyticsRollup } from '../Analytics/analytics.model';
import { PlatformPost } from '../PlatformPost/platformPost.model';

interface OverviewWithDelta {
  reach: number;
  engagements: number;
  views: number;
  engagement_rate: number;
  delta: {
    reach: number;
    engagements: number;
    views: number;
    engagement_rate: number;
  };
}

const pctDelta = (current: number, prior: number): number => {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 100 * 10) / 10;
};

export const aggregateOverview = async (teamId: string): Promise<OverviewWithDelta> => {
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const priorStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [currentPosts, priorPosts] = await Promise.all([
    PlatformPost.find({ team_id: teamId, published_at: { $gte: periodStart } }).lean(),
    PlatformPost.find({ team_id: teamId, published_at: { $gte: priorStart, $lt: periodStart } }).lean(),
  ]);

  const sum = (posts: typeof currentPosts) => {
    let reach = 0, engagements = 0, views = 0;
    for (const p of posts) {
      reach += p.metrics.reach;
      engagements += p.metrics.likes + p.metrics.comments + p.metrics.shares;
      views += p.metrics.views;
    }
    return {
      reach,
      engagements,
      views,
      engagement_rate: reach > 0 ? Math.round((engagements / reach) * 1000) / 10 : 0,
    };
  };

  const current = sum(currentPosts);
  const prior = sum(priorPosts);

  return {
    ...current,
    delta: {
      reach: pctDelta(current.reach, prior.reach),
      engagements: pctDelta(current.engagements, prior.engagements),
      views: pctDelta(current.views, prior.views),
      engagement_rate: pctDelta(current.engagement_rate, prior.engagement_rate),
    },
  };
};

export const aggregatePlatformBreakdowns = async (teamId: string) => {
  const rollups = await AnalyticsRollup.find({ team_id: teamId }).lean();
  return rollups.map((r) => ({
    platform: r.platform,
    status: r.status,
    overview: r.status === 'ok' ? r.overview : null,
    top_posts: r.status === 'ok' ? r.top_posts : [],
    best_times: r.status === 'ok' ? r.best_times : [],
    content_breakdown: r.status === 'ok' ? r.content_breakdown : [],
    fetched_at: r.fetched_at,
  }));
};
