import config from '../../config';
import { logger } from '../../lib/logger';
import { getAppToken } from '../NewsIngestion/adapters/reddit';

export interface EngagementFetchResult {
  source_id: string;
  points: number;
  comments: number;
  stars_delta: number;
  removed: boolean;
}

export interface EngagementFetcherOutput {
  results: EngagementFetchResult[];
  requestsUsed: number;
}

// eslint-disable-next-line no-unused-vars -- `items` names the parameter in this type signature only
export type EngagementFetcher = (items: { source_id: string }[]) => Promise<EngagementFetcherOutput>;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const HN_ITEM_URL = (id: string) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

interface HNItem {
  score?: number;
  descendants?: number;
  deleted?: boolean;
  dead?: boolean;
}

/** 1 request per item (same endpoint the ingestion adapter's Firebase path already used). */
const fetchHackerNewsEngagement: EngagementFetcher = async (items) => {
  let requestsUsed = 0;
  const results: EngagementFetchResult[] = [];

  await Promise.all(
    items.map(async ({ source_id }) => {
      requestsUsed += 1;
      try {
        const res = await fetch(HN_ITEM_URL(source_id));
        if (res.status === 404) {
          results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
          return;
        }
        if (!res.ok) throw new Error(`HackerNews item request failed: ${res.status}`);

        const body = (await res.json()) as HNItem | null;
        // The Firebase item endpoint returns a JSON `null` body (HTTP 200) for a removed story.
        if (!body || body.deleted || body.dead) {
          results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
          return;
        }

        results.push({ source_id, points: body.score ?? 0, comments: body.descendants ?? 0, stars_delta: 0, removed: false });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : err }, `[NewsRefresh] HackerNews item ${source_id} refresh failed`);
      }
    }),
  );

  return { results, requestsUsed };
};

const DEVTO_ARTICLE_URL = (id: string) => `https://dev.to/api/articles/${id}`;

interface DevToArticleDetail {
  public_reactions_count?: number;
  comments_count?: number;
}

/** 1 request per item. */
const fetchDevToEngagement: EngagementFetcher = async (items) => {
  let requestsUsed = 0;
  const results: EngagementFetchResult[] = [];

  await Promise.all(
    items.map(async ({ source_id }) => {
      requestsUsed += 1;
      try {
        const res = await fetch(DEVTO_ARTICLE_URL(source_id));
        if (res.status === 404 || res.status === 410) {
          results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
          return;
        }
        if (!res.ok) throw new Error(`Dev.to article request failed: ${res.status}`);

        const body = (await res.json()) as DevToArticleDetail;
        results.push({
          source_id,
          points: body.public_reactions_count ?? 0,
          comments: body.comments_count ?? 0,
          stars_delta: 0,
          removed: false,
        });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : err }, `[NewsRefresh] Dev.to article ${source_id} refresh failed`);
      }
    }),
  );

  return { results, requestsUsed };
};

const REDDIT_CHUNK_SIZE = 100;
const REDDIT_INFO_URL = 'https://oauth.reddit.com/api/info';

interface RedditInfoPost {
  name: string;
  ups?: number;
  num_comments?: number;
}

interface RedditInfoListing {
  data: { children: { data: RedditInfoPost }[] };
}

/** Batches up to 100 fullnames per request using the same cached OAuth app token the
 * ingestion adapter uses. Stored `source_id` is the bare post id; the info endpoint needs
 * `t3_`-prefixed fullnames. Maps the response back to items by `data.name`, never by
 * response order (the listing endpoint doesn't guarantee it). Credential-gated: skips
 * entirely (with a logged reason) when Reddit isn't configured. */
const fetchRedditEngagement: EngagementFetcher = async (items) => {
  const { client_id, client_secret } = config.news_ingestion.reddit;
  if (!client_id || !client_secret) {
    logger.warn('[NewsRefresh] Reddit not configured (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET unset) — skipping refresh');
    return { results: [], requestsUsed: 0 };
  }

  let requestsUsed = 0;
  const results: EngagementFetchResult[] = [];
  const token = await getAppToken();

  for (const batch of chunk(items, REDDIT_CHUNK_SIZE)) {
    requestsUsed += 1;
    try {
      const fullnames = batch.map(({ source_id }) => `t3_${source_id}`).join(',');
      const res = await fetch(`${REDDIT_INFO_URL}?id=${fullnames}`, {
        headers: {
          Authorization: `bearer ${token}`,
          'User-Agent': config.news_ingestion.reddit.user_agent,
        },
      });
      if (!res.ok) throw new Error(`Reddit info request failed: ${res.status}`);

      const listing = (await res.json()) as RedditInfoListing;
      const bySourceId = new Map(listing.data.children.map(({ data }) => [data.name.replace(/^t3_/, ''), data]));

      for (const { source_id } of batch) {
        const post = bySourceId.get(source_id);
        if (!post) {
          // Missing from the listing means Reddit is no longer serving this post.
          results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
          continue;
        }
        results.push({ source_id, points: post.ups ?? 0, comments: post.num_comments ?? 0, stars_delta: 0, removed: false });
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[NewsRefresh] Reddit batch refresh failed');
    }
  }

  return { results, requestsUsed };
};

/** Extension point (design.md decision 8): a future source gains re-polling by adding one entry
 * here — no other job code changes. `github_trending` and `rss:*` are deliberately never
 * registered (no cheap per-item re-fetch signal). */
export const ENGAGEMENT_FETCHERS: Record<string, EngagementFetcher> = {
  hackernews: fetchHackerNewsEngagement,
  reddit: fetchRedditEngagement,
  devto: fetchDevToEngagement,
};

export const REFRESHABLE_SOURCES = Object.keys(ENGAGEMENT_FETCHERS);
