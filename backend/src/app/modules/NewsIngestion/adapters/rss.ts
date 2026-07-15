import Parser from 'rss-parser';
import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';

const parser = new Parser();

const fetchFeed = async (feedUrl: string): Promise<RawNewsItem[]> => {
  const feed = await parser.parseURL(feedUrl);

  return (feed.items ?? [])
    .filter((item) => item.link && item.title)
    .map((item) => ({
      source: 'rss',
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
