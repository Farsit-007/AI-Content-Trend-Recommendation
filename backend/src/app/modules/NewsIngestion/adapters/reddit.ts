import config from '../../../config';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';
import { RawNewsItem } from '../newsIngestion.interface';

const TOKEN_CACHE_KEY = 'reddit:app_token';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';

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

interface RedditTokenResponse {
  access_token: string;
  expires_in: number;
}

/** Distinguishes an expired/revoked token (worth one retry with a fresh token) from any other failure. */
class RedditAuthError extends Error {}

const requestAppToken = async (): Promise<RedditTokenResponse> => {
  const { client_id, client_secret, user_agent } = config.news_ingestion.reddit;
  const basicAuth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': user_agent,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Reddit token request failed: ${res.status}`);
  return (await res.json()) as RedditTokenResponse;
};

/** Caches the app-only bearer token in Redis so repeated pipeline runs (cron or manual) reuse one token. */
const getAppToken = async (): Promise<string> => {
  const cached = await redis.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const { access_token, expires_in } = await requestAppToken();
  // 60s margin so a token is never used within a minute of its real expiry.
  await redis.set(TOKEN_CACHE_KEY, access_token, 'EX', Math.max(expires_in - 60, 60));
  return access_token;
};

const fetchSubredditListing = async (subreddit: string, token: string): Promise<RawNewsItem[]> => {
  const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/top.json?limit=25&t=day`, {
    headers: {
      Authorization: `bearer ${token}`,
      'User-Agent': config.news_ingestion.reddit.user_agent,
    },
  });

  if (res.status === 401) throw new RedditAuthError(`Reddit request unauthorized for r/${subreddit}`);
  if (!res.ok) throw new Error(`Reddit request failed for r/${subreddit}: ${res.status}`);

  const listing = (await res.json()) as RedditListing;
  return listing.data.children.map(({ data: post }) => ({
    source: 'reddit',
    source_id: post.id,
    title: post.title,
    url: `https://www.reddit.com${post.permalink}`,
    snippet: post.selftext?.slice(0, 500),
    content: post.selftext || undefined,
    published_at: post.created_utc ? new Date(post.created_utc * 1000) : undefined,
    raw_points: post.ups ?? 0,
    raw_comments: post.num_comments ?? 0,
    raw_stars_delta: 0,
  }));
};

/** On an expired/revoked token, invalidate the cache, obtain a fresh token, and retry exactly once. */
const fetchSubredditWithRetry = async (subreddit: string, token: string): Promise<RawNewsItem[]> => {
  try {
    return await fetchSubredditListing(subreddit, token);
  } catch (err) {
    if (!(err instanceof RedditAuthError)) throw err;
    await redis.del(TOKEN_CACHE_KEY);
    const freshToken = await getAppToken();
    return fetchSubredditListing(subreddit, freshToken);
  }
};

export const fetchReddit = async (): Promise<RawNewsItem[]> => {
  const { client_id, client_secret } = config.news_ingestion.reddit;
  if (!client_id || !client_secret) {
    // Throwing (rather than resolving to []) is deliberate: `runAllAdapters` catches this and
    // records it as this run's `error` for the reddit source, so run history shows an honest
    // "not configured" reason instead of looking like a source that just returned nothing.
    const message = 'Reddit not configured (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET unset)';
    logger.warn(`[NewsIngestion] ${message} — skipping`);
    throw new Error(message);
  }

  const token = await getAppToken();

  const results = await Promise.all(
    config.news_ingestion.reddit_subreddits.map((subreddit) =>
      fetchSubredditWithRetry(subreddit, token).catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] Reddit r/${subreddit} failed`);
        return [] as RawNewsItem[];
      }),
    ),
  );
  return results.flat();
};
