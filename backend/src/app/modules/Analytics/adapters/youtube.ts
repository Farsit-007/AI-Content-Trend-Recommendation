import { IAdapterPost, IAdapterResult } from '../analytics.interface';

export const youtubeAdapter = async (apiKey: string): Promise<IAdapterResult> => {
  const publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&forMine=true&publishedAfter=${publishedAfter}&maxResults=50&key=${apiKey}`,
  );

  if (!searchRes.ok) {
    throw new Error(`YouTube API error: ${searchRes.status} ${searchRes.statusText}`);
  }

  const searchData = (await searchRes.json()) as {
    items: { id: { videoId: string }; snippet: { title?: string; publishedAt?: string } }[];
  };

  const videoIds = (searchData.items ?? []).map((v) => v.id.videoId).join(',');
  if (!videoIds) return { status: 'ok', posts: [] };

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${apiKey}`,
  );

  if (!statsRes.ok) {
    throw new Error(`YouTube stats API error: ${statsRes.status} ${statsRes.statusText}`);
  }

  const statsData = (await statsRes.json()) as {
    items: { id: string; statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
  };

  const statsById = new Map(statsData.items.map((v) => [v.id, v.statistics]));

  const posts: IAdapterPost[] = (searchData.items ?? []).map((v) => {
    const stats = statsById.get(v.id.videoId) ?? {};
    const views = Number(stats.viewCount ?? 0);
    const likes = Number(stats.likeCount ?? 0);
    const comments = Number(stats.commentCount ?? 0);

    return {
      post_id: v.id.videoId,
      content_snippet: v.snippet.title?.slice(0, 200),
      metrics: { reach: views, likes, comments, shares: 0, views },
      published_at: v.snippet.publishedAt ? new Date(v.snippet.publishedAt) : undefined,
      format: 'video',
    };
  });

  return { status: 'ok', posts };
};
