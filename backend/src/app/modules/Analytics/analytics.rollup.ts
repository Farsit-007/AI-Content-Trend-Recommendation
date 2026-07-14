import { IAdapterPost, IAnalyticsOverview, IAnalyticsRollup, ITopPost } from './analytics.interface';

export const computeRollup = (
  teamId: string,
  platform: string,
  posts: IAdapterPost[],
): Pick<IAnalyticsRollup, 'overview' | 'top_posts' | 'best_times' | 'content_breakdown' | 'period'> => {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (posts.length === 0) {
    return {
      period: { start, end: now },
      overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
      top_posts: [],
      best_times: [],
      content_breakdown: [],
    };
  }

  let totalReach = 0;
  let totalEngagements = 0;
  let totalViews = 0;

  const hourCounts: Record<number, { count: number; totalReach: number }> = {};
  const formatEngagements: Record<string, { total: number; count: number }> = {};

  for (const post of posts) {
    const engagements = post.metrics.likes + post.metrics.comments + post.metrics.shares;
    totalReach += post.metrics.reach;
    totalEngagements += engagements;
    totalViews += post.metrics.views;

    if (post.published_at) {
      const hour = new Date(post.published_at).getHours();
      const day = new Date(post.published_at).getDay();
      const key = hour * 10 + day;
      if (!hourCounts[key]) hourCounts[key] = { count: 0, totalReach: 0 };
      hourCounts[key].count++;
      hourCounts[key].totalReach += post.metrics.reach;
    }

    const fmt = post.format ?? 'unknown';
    if (!formatEngagements[fmt]) formatEngagements[fmt] = { total: 0, count: 0 };
    formatEngagements[fmt].total += post.metrics.reach > 0 ? engagements / post.metrics.reach : 0;
    formatEngagements[fmt].count++;
  }

  const overview: IAnalyticsOverview = {
    reach: totalReach,
    engagements: totalEngagements,
    views: totalViews,
    engagement_rate: totalReach > 0 ? totalEngagements / totalReach : 0,
  };

  const top_posts: ITopPost[] = [...posts]
    .sort((a, b) => b.metrics.likes + b.metrics.comments + b.metrics.shares - (a.metrics.likes + a.metrics.comments + a.metrics.shares))
    .slice(0, 10)
    .map((p) => ({
      post_id: p.post_id,
      content_snippet: p.content_snippet,
      reach: p.metrics.reach,
      engagement: p.metrics.likes + p.metrics.comments + p.metrics.shares,
      format: p.format,
      published_at: p.published_at,
    }));

  const best_times = Object.entries(hourCounts)
    .map(([key, val]) => ({
      hour: Math.floor(Number(key) / 10),
      day: Number(key) % 10,
      avg_reach: val.totalReach / val.count,
    }))
    .sort((a, b) => b.avg_reach - a.avg_reach)
    .slice(0, 5);

  const content_breakdown = Object.entries(formatEngagements).map(([format, val]) => ({
    format,
    avg_engagement_rate: val.count > 0 ? val.total / val.count : 0,
  }));

  return { period: { start, end: now }, overview, top_posts, best_times, content_breakdown };
};
