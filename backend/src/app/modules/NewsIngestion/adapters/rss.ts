import Parser from 'rss-parser';
import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';

// Conditional GET (HTTP 304) is deliberately not implemented: a feed correctly answering 304
// would legitimately show fetched: 0 for that run, which the zero-streak alert can't currently
// tell apart from a dead feed without plumbing a per-feed HTTP-status signal through
// AdapterResult/IngestionRun — not worth it at ~200 requests/day. Revisit past ~50 feeds.
const parser = new Parser({ timeout: 10_000 });

/** `rss:<hostname>` (lowercased, `www.` stripped) so per-feed health is visible; falls back to `rss` for an unparseable feed URL. */
export const feedLabel = (feedUrl: string): string => {
  try {
    const hostname = new URL(feedUrl).hostname.toLowerCase().replace(/^www\./, '');
    return `rss:${hostname}`;
  } catch {
    return 'rss';
  }
};

const fetchFeed = async (feedUrl: string): Promise<RawNewsItem[]> => {
  const feed = await parser.parseURL(feedUrl);
  const source = feedLabel(feedUrl);

  return (feed.items ?? [])
    .filter((item) => item.link && item.title)
    .map((item) => ({
      source,
      source_id: item.guid ?? (item.link as string),
      title: item.title as string,
      url: item.link as string,
      snippet: item.contentSnippet,
      published_at: item.isoDate ? new Date(item.isoDate) : undefined,
      raw_points: 0,
      raw_comments: 0,
      raw_stars_delta: 0,
    }));
};

export const fetchRss = async (): Promise<RawNewsItem[]> => {
  const results = await Promise.all(
    config.news_ingestion.rss_feeds.map((feedUrl) =>
      fetchFeed(feedUrl).catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] RSS feed ${feedUrl} failed`);
        return [] as RawNewsItem[];
      }),
    ),
  );
  return results.flat();
};
