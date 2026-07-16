import { logger } from '../../../lib/logger';
import { GraphApiError, graphGet } from '../../MetaOAuth/metaOAuth.graph';
import { IAdapterPost, IAdapterResult } from '../analytics.interface';

/**
 * Real Facebook Page adapter. Pulls the last 30 days of published posts with real engagement
 * summaries and the post-June-2026 "views family" insight metrics (`post_media_view`,
 * `post_media_view_unique`) — the old impression-family metrics were removed by Meta on
 * 2026-06-15 and would 400 / return nulls.
 *
 * `token` is the long-lived Page token; `accountId` is the FB Page id.
 */

const MAX_PAGES = 4; // ≤100 posts over the 30-day window keeps call volume tiny
const PAGE_LIMIT = 25;

const INSIGHT_METRICS = 'post_media_view,post_media_view_unique';

const baseFields = [
  'id',
  'message',
  'created_time',
  'attachments{media_type}',
  'reactions.summary(true).limit(0)',
  'comments.summary(true).limit(0)',
  'shares',
].join(',');

const fieldsWithInsights = `${baseFields},insights.metric(${INSIGHT_METRICS})`;

interface GraphPost {
  id: string;
  message?: string;
  created_time?: string;
  attachments?: { data?: { media_type?: string }[] };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  insights?: { data?: { name: string; values?: { value?: number }[] }[] };
}

interface GraphPostsResponse {
  data?: GraphPost[];
  paging?: { cursors?: { after?: string }; next?: string };
}

const FORMAT_MAP: Record<string, string> = {
  photo: 'photo',
  video: 'video',
  video_inline: 'video',
  link: 'link',
  status: 'status',
  album: 'photo',
  share: 'link',
};

const mapPost = (p: GraphPost): IAdapterPost => {
  const insightMap: Record<string, number> = {};
  for (const insight of p.insights?.data ?? []) {
    insightMap[insight.name] = insight.values?.[0]?.value ?? 0;
  }

  const rawMediaType = p.attachments?.data?.[0]?.media_type?.toLowerCase();
  const format = rawMediaType ? FORMAT_MAP[rawMediaType] ?? rawMediaType : 'status';

  return {
    post_id: p.id,
    content_snippet: p.message?.slice(0, 200),
    metrics: {
      views: insightMap['post_media_view'] ?? 0,
      reach: insightMap['post_media_view_unique'] ?? 0,
      likes: p.reactions?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
    },
    published_at: p.created_time ? new Date(p.created_time) : undefined,
    format,
  };
};

/** True when a Graph error means "this insight metric isn't available on this object" (drift). */
const isMetricUnsupported = (err: unknown): boolean =>
  err instanceof GraphApiError && (err.code === 100 || /metric/i.test(err.message));

export const facebookAdapter = async (token: string, accountId: string): Promise<IAdapterResult> => {
  if (!accountId) {
    throw new Error('Facebook adapter requires a page id (account_id) — reconnect the page');
  }

  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const posts: IAdapterPost[] = [];
  let after: string | undefined;
  // When insights drift (#100), fall back to engagement-only for the rest of the run.
  let includeInsights = true;

  for (let page = 0; page < MAX_PAGES; page++) {
    let res: GraphPostsResponse;
    try {
      res = await graphGet<GraphPostsResponse>(
        `${accountId}/published_posts`,
        {
          fields: includeInsights ? fieldsWithInsights : baseFields,
          since,
          limit: PAGE_LIMIT,
          after,
        },
        token,
      );
    } catch (err) {
      // Only tolerate metric drift — token death (190) / rate limits must propagate to the taxonomy.
      if (includeInsights && isMetricUnsupported(err)) {
        logger.warn('[Analytics] Facebook insight metrics unsupported — falling back to engagement-only');
        includeInsights = false;
        page--; // retry this same page without insights
        continue;
      }
      throw err;
    }

    for (const p of res.data ?? []) posts.push(mapPost(p));

    after = res.paging?.cursors?.after;
    if (!after || !res.paging?.next) break;

    // Reuse the project's inter-call pacing between Graph calls.
    await new Promise((r) => setTimeout(r, 100));
  }

  return { status: 'ok', posts };
};
