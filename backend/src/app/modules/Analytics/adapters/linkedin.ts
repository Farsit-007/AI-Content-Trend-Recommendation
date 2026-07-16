import { logger } from '../../../lib/logger';
import { LinkedInApiError, linkedinGet } from '../../LinkedInOAuth/linkedinOAuth.api';
import { IAdapterPost, IAdapterResult } from '../analytics.interface';

/**
 * Real LinkedIn organization adapter. Driven by the member access token (with admin ACL on the org)
 * plus the numeric organization id (passed as `accountId`). Pulls recent organization posts and
 * their lifetime share statistics, mapping to `IAdapterPost`.
 *
 * Requires the **Community Management API** product on the LinkedIn app. Until that is approved the
 * REST endpoints return HTTP 403 — we surface that as `pending_approval` (never fake numbers, never
 * a crash), matching how the refresh service treats platforms awaiting approval.
 *
 * `token` is the long-lived member token; `accountId` is the organization id (e.g. `2414183`).
 */

const POST_COUNT = 25;

interface LinkedInPost {
  id?: string; // urn:li:share:… or urn:li:ugcPost:…
  commentary?: string;
  createdAt?: number; // epoch ms
  content?: {
    media?: { id?: string };
    article?: unknown;
    multiImage?: unknown;
  };
}

interface PostsResponse {
  elements?: LinkedInPost[];
}

interface ShareStat {
  organizationalEntity?: string;
  share?: string;
  ugcPost?: string;
  totalShareStatistics?: {
    impressionCount?: number;
    uniqueImpressionsCount?: number;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    clickCount?: number;
  };
}

interface ShareStatsResponse {
  elements?: ShareStat[];
}

const inferFormat = (content?: LinkedInPost['content']): string => {
  if (!content) return 'text';
  if (content.article) return 'article';
  if (content.multiImage) return 'image';
  if (content.media?.id?.includes(':video:')) return 'video';
  if (content.media?.id?.includes(':image:')) return 'image';
  if (content.media) return 'media';
  return 'text';
};

/** Restli 2.0 list literal, e.g. List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A2). */
const restliList = (urns: string[]): string => `List(${urns.map((u) => encodeURIComponent(u)).join(',')})`;

/** Fetch lifetime per-post statistics for a batch of share/ugcPost URNs; tolerate a failed batch. */
const fetchStatsFor = async (
  orgId: string,
  urns: string[],
  paramName: 'shares' | 'ugcPosts',
  token: string,
): Promise<Map<string, ShareStat['totalShareStatistics']>> => {
  const map = new Map<string, ShareStat['totalShareStatistics']>();
  if (urns.length === 0) return map;
  try {
    const orgUrn = `urn:li:organization:${orgId}`;
    const res = await linkedinGet<ShareStatsResponse>(
      `rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&${paramName}=${restliList(urns)}`,
      token,
    );
    for (const el of res.elements ?? []) {
      const key = el.share ?? el.ugcPost;
      if (key) map.set(key, el.totalShareStatistics);
    }
  } catch (err) {
    // Per-batch statistics failure (metric drift / partial permission) — keep the posts, zero metrics.
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[Analytics] LinkedIn share statistics unavailable — zeroing engagement for this batch',
    );
  }
  return map;
};

export const linkedinAdapter = async (token: string, accountId: string): Promise<IAdapterResult> => {
  if (!accountId) {
    throw new Error('LinkedIn adapter requires an organization id (account_id) — reconnect the organization');
  }

  try {
    const orgUrn = `urn:li:organization:${accountId}`;
    const postsRes = await linkedinGet<PostsResponse>(
      `rest/posts?q=author&author=${encodeURIComponent(orgUrn)}&count=${POST_COUNT}&sortBy=LAST_MODIFIED`,
      token,
    );

    const posts = (postsRes.elements ?? []).filter((p) => p.id);
    if (posts.length === 0) return { status: 'ok', posts: [] };

    // Statistics are addressed by URN type — split shares from ugcPosts and fetch each group.
    const shareUrns = posts.map((p) => p.id!).filter((id) => id.includes(':share:'));
    const ugcUrns = posts.map((p) => p.id!).filter((id) => id.includes(':ugcPost:'));
    const [shareStats, ugcStats] = await Promise.all([
      fetchStatsFor(accountId, shareUrns, 'shares', token),
      fetchStatsFor(accountId, ugcUrns, 'ugcPosts', token),
    ]);

    const mapped: IAdapterPost[] = posts.map((p) => {
      const stats = shareStats.get(p.id!) ?? ugcStats.get(p.id!);
      return {
        post_id: p.id!,
        content_snippet: p.commentary?.slice(0, 200),
        metrics: {
          views: stats?.impressionCount ?? 0,
          reach: stats?.uniqueImpressionsCount ?? 0,
          likes: stats?.likeCount ?? 0,
          comments: stats?.commentCount ?? 0,
          shares: stats?.shareCount ?? 0,
        },
        published_at: p.createdAt ? new Date(p.createdAt) : undefined,
        format: inferFormat(p.content),
      };
    });

    return { status: 'ok', posts: mapped };
  } catch (err) {
    // App lacks the Community Management API product (or org access) — report pending approval, not error.
    if (err instanceof LinkedInApiError && err.isForbidden) {
      logger.warn('[Analytics] LinkedIn returned 403 — Community Management API not approved; pending_approval');
      return { status: 'pending_approval', posts: [] };
    }
    throw err;
  }
};
