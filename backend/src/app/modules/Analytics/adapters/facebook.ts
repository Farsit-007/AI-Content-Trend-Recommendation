import { IAdapterPost, IAdapterResult } from '../analytics.interface';

export const facebookAdapter = async (token: string): Promise<IAdapterResult> => {
  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const fields = 'id,message,created_time,insights.metric(post_impressions,post_engaged_users,post_clicks)';

  const postsRes = await fetch(
    `https://graph.facebook.com/v19.0/me/posts?fields=${fields}&since=${since}&limit=50&access_token=${token}`,
  );

  if (!postsRes.ok) {
    throw new Error(`Facebook API error: ${postsRes.status} ${postsRes.statusText}`);
  }

  const data = (await postsRes.json()) as {
    data: {
      id: string;
      message?: string;
      created_time?: string;
      insights?: { data: { name: string; values: { value: number }[] }[] };
    }[];
  };

  const posts: IAdapterPost[] = (data.data ?? []).map((p) => {
    const insightMap: Record<string, number> = {};
    for (const insight of p.insights?.data ?? []) {
      insightMap[insight.name] = insight.values[0]?.value ?? 0;
    }

    return {
      post_id: p.id,
      content_snippet: p.message?.slice(0, 200),
      metrics: {
        reach: insightMap['post_impressions'] ?? 0,
        likes: 0,
        comments: 0,
        shares: 0,
        views: insightMap['post_impressions'] ?? 0,
      },
      published_at: p.created_time ? new Date(p.created_time) : undefined,
    };
  });

  return { status: 'ok', posts };
};
