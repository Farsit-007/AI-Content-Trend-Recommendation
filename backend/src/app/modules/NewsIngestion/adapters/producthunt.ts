import config from '../../../config';
import { logger } from '../../../lib/logger';
import { redis } from '../../../lib/redis';
import { RawNewsItem } from '../newsIngestion.interface';

const TOKEN_CACHE_KEY = 'producthunt:app_token';
const TOKEN_URL = 'https://api.producthunt.com/v2/oauth/token';
const GRAPHQL_URL = 'https://api.producthunt.com/v2/api/graphql';
// Not derived from a token-response expires_in (Product Hunt's client-credentials tokens have no
// documented contractual lifetime) — a conservative fixed TTL just saves a daily re-auth request;
// the 401-triggered retry below is the actual correctness net for early revocation.
const TOKEN_TTL_SECONDS = 86400;

const QUERY = `
  query TopLaunches($postedAfter: DateTime!) {
    posts(order: VOTES, postedAfter: $postedAfter, first: 25) {
      edges {
        node { id name tagline description url website thumbnail { url } votesCount commentsCount createdAt }
      }
    }
  }
`;

interface ProductHuntNode {
  id: string;
  name: string;
  tagline: string;
  description?: string;
  /** The Product Hunt post page itself — a discussion/listing page, not the product's real site. */
  url: string;
  /** Product Hunt's tracking-redirect link that resolves to the product's actual external site (verified live against the real API — distinct from `url`). */
  website?: string;
  thumbnail?: { url: string };
  votesCount: number;
  commentsCount: number;
  createdAt: string;
}

interface ProductHuntGraphQLResponse {
  data?: { posts?: { edges: { node: ProductHuntNode }[] } };
  errors?: { message: string }[];
}

interface ProductHuntTokenResponse {
  access_token: string;
}

/** Distinguishes an expired/revoked token (worth one retry with a fresh token) from any other failure. */
class ProductHuntAuthError extends Error {}

const requestAppToken = async (): Promise<ProductHuntTokenResponse> => {
  const { client_id, client_secret } = config.news_ingestion.producthunt;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, client_secret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Product Hunt token request failed: ${res.status}`);
  return (await res.json()) as ProductHuntTokenResponse;
};

/** Caches the app-only bearer token in Redis so repeated pipeline runs (cron or manual) reuse one token. */
const getAppToken = async (): Promise<string> => {
  const cached = await redis.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const { access_token } = await requestAppToken();
  await redis.set(TOKEN_CACHE_KEY, access_token, 'EX', TOKEN_TTL_SECONDS);
  return access_token;
};

const fetchTopLaunches = async (token: string): Promise<RawNewsItem[]> => {
  const postedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: { postedAfter } }),
  });

  if (res.status === 401) throw new ProductHuntAuthError('Product Hunt GraphQL request unauthorized');
  if (!res.ok) throw new Error(`Product Hunt GraphQL request failed: ${res.status}`);

  const body = (await res.json()) as ProductHuntGraphQLResponse;
  // A GraphQL server can return HTTP 200 with an `errors` array and no `data` — res.ok alone would
  // never catch this, and a naive implementation would silently emit zero items instead of erroring.
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Product Hunt GraphQL error: ${body.errors[0].message}`);
  }
  if (!body.data?.posts) {
    throw new Error('Product Hunt GraphQL returned an unexpected response shape');
  }

  return body.data.posts.edges.map(({ node }) => ({
    source: 'producthunt',
    source_id: node.id,
    title: `${node.name} — ${node.tagline}`,
    // `website` (the real product) becomes the resource; `url` (the PH post page) becomes the
    // discussion link — see design.md decision 2 of news-source-link-and-thumbnail-fields.
    url: node.website ?? node.url,
    discussion_url: node.url,
    thumbnail_url: node.thumbnail?.url,
    snippet: node.tagline,
    content: node.description || undefined,
    published_at: new Date(node.createdAt),
    raw_points: node.votesCount,
    raw_comments: node.commentsCount,
    raw_stars_delta: 0,
  }));
};

/** On an expired/revoked token, invalidate the cache, obtain a fresh token, and retry exactly once. */
const fetchTopLaunchesWithRetry = async (token: string): Promise<RawNewsItem[]> => {
  try {
    return await fetchTopLaunches(token);
  } catch (err) {
    if (!(err instanceof ProductHuntAuthError)) throw err;
    await redis.del(TOKEN_CACHE_KEY);
    const freshToken = await getAppToken();
    return fetchTopLaunches(freshToken);
  }
};

export const fetchProductHunt = async (): Promise<RawNewsItem[]> => {
  const { client_id, client_secret } = config.news_ingestion.producthunt;
  if (!client_id || !client_secret) {
    // Throwing (rather than resolving to []) is deliberate: `runAllAdapters` catches this and
    // records it as this run's `error` for the producthunt source, so run history shows an honest
    // "not configured" reason instead of looking like a source that just returned nothing.
    const message = 'producthunt not configured (PRODUCTHUNT_CLIENT_ID/PRODUCTHUNT_CLIENT_SECRET unset)';
    logger.warn(`[NewsIngestion] ${message} — skipping`);
    throw new Error(message);
  }

  const token = await getAppToken();
  return fetchTopLaunchesWithRetry(token);
};
