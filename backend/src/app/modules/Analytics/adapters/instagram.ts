import { logger } from '../../../lib/logger';
import { graphBatch, graphGet } from '../../MetaOAuth/metaOAuth.graph';
import { IAdapterPost, IAdapterResult } from '../analytics.interface';

/**
 * Real Instagram Business adapter. Driven by the SAME long-lived Page token as Facebook plus the
 * linked `ig_user_id` (passed as `accountId`). Pulls the last 30 days of media and per-media
 * insights (batched into one HTTP call). IG replaced `impressions` with the `views` family in
 * 2025-26 — same rule as Facebook.
 */

const MEDIA_LIMIT = 25;

interface GraphMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

interface MediaListResponse {
  data?: GraphMedia[];
}

interface InsightsResponse {
  data?: { name: string; values?: { value?: number }[] }[];
}

/** FEED/CAROUSEL vs REELS get different insight metric sets. Stories are skipped entirely. */
const metricsFor = (mediaProductType?: string): string => {
  if ((mediaProductType ?? '').toUpperCase() === 'REELS') return 'views,reach,saved,shares';
  return 'views,reach,saved';
};

const formatFor = (mediaProductType?: string): string => {
  switch ((mediaProductType ?? '').toUpperCase()) {
    case 'REELS':
      return 'reel';
    case 'STORY':
      return 'story';
    default:
      return 'post';
  }
};

export const instagramAdapter = async (token: string, accountId: string): Promise<IAdapterResult> => {
  if (!accountId) {
    throw new Error('Instagram adapter requires an ig_user_id (account_id) — reconnect the page');
  }

  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

  const mediaRes = await graphGet<MediaListResponse>(
    `${accountId}/media`,
    {
      fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count',
      since,
      limit: MEDIA_LIMIT,
    },
    token,
  );

  // Stories vanish after 24h and aren't worth per-media insight calls — skip them.
  const media = (mediaRes.data ?? []).filter((m) => (m.media_product_type ?? '').toUpperCase() !== 'STORY');
  if (media.length === 0) return { status: 'ok', posts: [] };

  // One batched HTTP call for all per-media insights (≤50 sub-requests).
  const relativeUrls = media.map((m) => `${m.id}/insights?metric=${metricsFor(m.media_product_type)}`);
  const insightResults = await graphBatch<InsightsResponse>(relativeUrls, token);

  const posts: IAdapterPost[] = media.map((m, i) => {
    const insightMap: Record<string, number> = {};
    const result = insightResults[i];
    if (result && !('error' in result)) {
      for (const insight of result.data ?? []) {
        insightMap[insight.name] = insight.values?.[0]?.value ?? 0;
      }
    } else if (result && 'error' in result) {
      // Per-item insight failure (e.g. metric drift) — zero it, keep engagement. Never fail the run.
      logger.warn({ mediaId: m.id }, '[Analytics] Instagram media insights unavailable — zeroing views/reach');
    }

    return {
      post_id: m.id,
      content_snippet: m.caption?.slice(0, 200),
      metrics: {
        views: insightMap['views'] ?? 0,
        reach: insightMap['reach'] ?? 0,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        shares: insightMap['shares'] ?? 0,
      },
      published_at: m.timestamp ? new Date(m.timestamp) : undefined,
      format: formatFor(m.media_product_type),
    };
  });

  return { status: 'ok', posts };
};
