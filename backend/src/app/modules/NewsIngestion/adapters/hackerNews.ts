import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';
import { stripHtml } from './htmlText';

const FRONT_PAGE_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
const RISERS_URL = 'https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E50&hitsPerPage=50';

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string;
  story_text?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

const fetchAlgolia = async (url: string): Promise<AlgoliaHit[] | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HackerNews (Algolia) request failed for ${url}: ${res.status}`);
    const body = (await res.json()) as AlgoliaResponse;
    return body.hits;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] HackerNews (Algolia) request failed: ${url}`);
    return null;
  }
};

/** Front page + risers (points>50, by date) replace the old 31-request Firebase flow with 2 requests. */
export const fetchHackerNews = async (): Promise<RawNewsItem[]> => {
  const [frontPage, risers] = await Promise.all([fetchAlgolia(FRONT_PAGE_URL), fetchAlgolia(RISERS_URL)]);

  if (frontPage === null && risers === null) {
    throw new Error('HackerNews (Algolia) request failed: both front-page and risers requests failed');
  }

  const merged = new Map<string, AlgoliaHit>();
  for (const hit of [...(frontPage ?? []), ...(risers ?? [])]) {
    if (!merged.has(hit.objectID)) merged.set(hit.objectID, hit);
  }

  return Array.from(merged.values())
    .filter((hit): hit is AlgoliaHit & { title: string } => !!hit.title)
    .map((hit) => ({
      source: 'hackernews',
      source_id: String(hit.objectID),
      title: hit.title,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      // Always constructible, independent of what `url` resolved to — see design.md decision 3
      // of news-source-link-and-thumbnail-fields.
      discussion_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      description: hit.story_text ? stripHtml(hit.story_text) : undefined,
      snippet: hit.story_text ? stripHtml(hit.story_text) : undefined,
      content: hit.story_text ? stripHtml(hit.story_text) : undefined,
      published_at: hit.created_at_i ? new Date(hit.created_at_i * 1000) : undefined,
      raw_points: hit.points ?? 0,
      raw_comments: hit.num_comments ?? 0,
      raw_stars_delta: 0,
    }));
};
