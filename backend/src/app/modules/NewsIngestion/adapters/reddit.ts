import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';

interface RedditPost {
  id: string;
  title: string;
  permalink: string;
  selftext?: string;
  ups?: number;
  num_comments?: number;
  created_utc?: number;
}

interface RedditListing {
  data: {
    children: { data: RedditPost }[];
  };
}

const fetchSubreddit = async (subreddit: string): Promise<RawNewsItem[]> => {
  const res = await fetch(`https://www.reddit.com/r/${subreddit}/top.json?limit=25`, {
    headers: { 'User-Agent': 'GrowthStudioBot/1.0 (news ingestion)' },
  });
  if (!res.ok) throw new Error(`Reddit request failed for r/${subreddit}: ${res.status}`);
  const listing = (await res.json()) as RedditListing;

  return listing.data.children.map(({ data: post }) => ({
    source: 'reddit',
    source_id: post.id,
    title: post.title,
    url: `https://www.reddit.com${post.permalink}`,
    snippet: post.selftext?.slice(0, 500),
    published_at: post.created_utc ? new Date(post.created_utc * 1000) : undefined,
    raw_points: post.ups ?? 0,
    raw_comments: post.num_comments ?? 0,
    raw_stars_delta: 0,
  }));
};

export const fetchReddit = async (): Promise<RawNewsItem[]> => {
  const results = await Promise.all(
    config.news_ingestion.reddit_subreddits.map((subreddit) =>
      fetchSubreddit(subreddit).catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] Reddit r/${subreddit} failed`);
        return [] as RawNewsItem[];
      }),
    ),
  );
  return results.flat();
};
