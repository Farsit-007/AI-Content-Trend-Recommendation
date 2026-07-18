import Parser from 'rss-parser';
import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';
import { stripHtml } from './htmlText';

/**
 * Adds the `content:encoded` element (full article body on many feeds) as `contentEncoded`, and
 * `media:thumbnail` (a common feed-thumbnail convention) as `mediaThumbnail` — neither is exposed
 * by rss-parser by default. `media:thumbnail` carries its URL as an XML attribute, not text
 * content, so rss-parser (via xml2js's default `attrkey: '$'`) surfaces it as `{ $: { url } }`
 * rather than a plain string — standard, documented rss-parser convention for attribute-only
 * custom tags, not something this codebase invented.
 */
interface RssItemWithContent extends Parser.Item {
  contentEncoded?: string;
  mediaThumbnail?: { $?: { url?: string } };
}

// Conditional GET (HTTP 304) is deliberately not implemented: a feed correctly answering 304
// would legitimately show fetched: 0 for that run, which the zero-streak alert can't currently
// tell apart from a dead feed without plumbing a per-feed HTTP-status signal through
// AdapterResult/IngestionRun — not worth it at ~200 requests/day. Revisit past ~50 feeds.
const parser = new Parser<Record<string, unknown>, RssItemWithContent>({
  timeout: 10_000,
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

/**
 * Best-effort thumbnail: `media:thumbnail`'s `url` attribute, else a native `<enclosure>` whose
 * type is an image (rss-parser already parses `enclosure` natively — no customFields entry
 * needed). Absent on the majority of feeds this pipeline ingests, which is the expected, accepted
 * outcome (design.md decision 5 of news-source-link-and-thumbnail-fields), not a bug to chase.
 */
const resolveThumbnail = (item: RssItemWithContent): string | undefined => {
  const mediaUrl = item.mediaThumbnail?.$?.url;
  if (mediaUrl) return mediaUrl;
  if (item.enclosure?.type?.startsWith('image/') && item.enclosure.url) return item.enclosure.url;
  return undefined;
};

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
      thumbnail_url: resolveThumbnail(item),
      snippet: item.contentSnippet,
      content: item.contentEncoded ? stripHtml(item.contentEncoded) : undefined,
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
