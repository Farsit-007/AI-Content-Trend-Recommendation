import { logger } from '../../lib/logger';

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

export type EngagementFetcher = (items: { source_id: string }[]) => Promise<EngagementFetcherOutput>;

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

/** Extension point (design.md decision 8): a future source gains re-polling by adding one entry
 * here — no other job code changes. `github_trending` is deliberately never registered (no
 * cheap per-item re-fetch signal). */
export const ENGAGEMENT_FETCHERS: Record<string, EngagementFetcher> = {
  hackernews: fetchHackerNewsEngagement,
  devto: fetchDevToEngagement,
};

export const REFRESHABLE_SOURCES = Object.keys(ENGAGEMENT_FETCHERS);
