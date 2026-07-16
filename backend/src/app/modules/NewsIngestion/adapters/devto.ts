import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';

interface DevToArticle {
  id: number;
  title: string;
  url: string;
  description?: string;
  published_at?: string;
  public_reactions_count?: number;
  comments_count?: number;
}

const TOP_URL = 'https://dev.to/api/articles?top=1&per_page=50';
const RISING_URL = 'https://dev.to/api/articles?state=rising&per_page=50';

const fetchArticles = async (url: string): Promise<DevToArticle[] | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Dev.to request failed for ${url}: ${res.status}`);
    return (await res.json()) as DevToArticle[];
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] Dev.to request failed: ${url}`);
    return null;
  }
};

/** `top=1` (daily top) and `state=rising` are fetched together so results fit the 72h freshness window that `?top=7` (weekly) missed. */
export const fetchDevTo = async (): Promise<RawNewsItem[]> => {
  const [top, rising] = await Promise.all([fetchArticles(TOP_URL), fetchArticles(RISING_URL)]);

  if (top === null && rising === null) {
    throw new Error('Dev.to request failed: both top and rising requests failed');
  }

  const merged = new Map<number, DevToArticle>();
  for (const article of [...(top ?? []), ...(rising ?? [])]) {
    merged.set(article.id, article);
  }

  return Array.from(merged.values()).map((article) => ({
    source: 'devto',
    source_id: String(article.id),
    title: article.title,
    url: article.url,
    snippet: article.description,
    published_at: article.published_at ? new Date(article.published_at) : undefined,
    raw_points: article.public_reactions_count ?? 0,
    raw_comments: article.comments_count ?? 0,
    raw_stars_delta: 0,
  }));
};
