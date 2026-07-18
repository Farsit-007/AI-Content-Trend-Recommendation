import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';

const MAX_QUERIES = 3;
const ITEMS_PER_QUERY = 10;
const SEARCH_URL = 'https://gnews.io/api/v4/search';

interface GNewsArticle {
  title: string;
  description?: string;
  url: string;
  image?: string;
  publishedAt: string;
}

interface GNewsResponse {
  articles?: GNewsArticle[];
  errors?: string[];
}

const fetchTopicArticles = async (topic: string): Promise<RawNewsItem[]> => {
  const { api_key } = config.news_ingestion.gnews;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(topic)}&lang=en&max=${ITEMS_PER_QUERY}&apikey=${api_key}`;

  const res = await fetch(url);
  const body = (await res.json()) as GNewsResponse;

  if (!res.ok || !Array.isArray(body.articles)) {
    const detail = body.errors?.join('; ') ?? res.status;
    throw new Error(`GNews request failed for topic "${topic}": ${detail}`);
  }

  return body.articles.map((article) => ({
    source: 'gnews',
    source_id: article.url,
    title: article.title,
    url: article.url,
    thumbnail_url: article.image,
    snippet: article.description,
    published_at: new Date(article.publishedAt),
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: 0,
  }));
};

export const fetchGNews = async (): Promise<RawNewsItem[]> => {
  const { api_key, queries } = config.news_ingestion.gnews;
  if (!api_key || queries.length === 0) {
    // Throwing (rather than resolving to []) is deliberate: `runAllAdapters` catches this and
    // records it as this run's `error` for the gnews source, so run history shows an honest
    // "not configured" reason instead of looking like a source that just returned nothing.
    const message = 'gnews not configured (GNEWS_API_KEY/NEWS_INGESTION_GNEWS_QUERIES unset)';
    logger.warn(`[NewsIngestion] ${message} — skipping`);
    throw new Error(message);
  }

  const topics = queries.slice(0, MAX_QUERIES);
  if (queries.length > MAX_QUERIES) {
    logger.warn(`[NewsIngestion] GNews: ${queries.length} topics configured, only using the first ${MAX_QUERIES}`);
  }

  const results = await Promise.allSettled(topics.map((topic) => fetchTopicArticles(topic)));
  const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  const failures = results
    .map((result, i) => (result.status === 'rejected' ? `${topics[i]}: ${result.reason?.message ?? result.reason}` : null))
    .filter((reason): reason is string => reason !== null);

  if (items.length === 0 && failures.length > 0) {
    throw new Error(`GNews: all queries failed (${failures.join('; ')})`);
  }

  for (const reason of failures) {
    logger.error(`[NewsIngestion] GNews query failed: ${reason}`);
  }

  return items;
};
