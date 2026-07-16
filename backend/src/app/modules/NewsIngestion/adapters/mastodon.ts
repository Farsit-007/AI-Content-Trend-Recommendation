import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';
import { stripHtml } from './htmlText';

interface MastodonTrendingLink {
  url: string;
  title: string;
  description?: string;
  history?: { accounts?: string; uses?: string }[];
}

const fetchInstanceTrends = async (instance: string): Promise<MastodonTrendingLink[]> => {
  const res = await fetch(`https://${instance}/api/v1/trends/links`, {
    headers: { 'User-Agent': 'GrowthStudioBot/1.0' },
  });
  if (!res.ok) throw new Error(`Mastodon request failed for ${instance}: ${res.status}`);
  return (await res.json()) as MastodonTrendingLink[];
};

const sharerCount = (link: MastodonTrendingLink): number => Number(link.history?.[0]?.accounts ?? 0);

export const fetchMastodon = async (): Promise<RawNewsItem[]> => {
  const { mastodon_instances } = config.news_ingestion;
  if (mastodon_instances.length === 0) {
    const message = 'mastodon not configured (NEWS_INGESTION_MASTODON_INSTANCES is empty)';
    logger.warn(`[NewsIngestion] ${message} — skipping`);
    throw new Error(message);
  }

  const results = await Promise.allSettled(mastodon_instances.map((instance) => fetchInstanceTrends(instance)));

  const merged = new Map<string, MastodonTrendingLink>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const link of result.value) {
      const existing = merged.get(link.url);
      if (!existing || sharerCount(link) > sharerCount(existing)) merged.set(link.url, link);
    }
  }

  const items = Array.from(merged.values()).map((link) => ({
    source: 'mastodon',
    source_id: link.url,
    title: link.title,
    url: link.url,
    snippet: link.description ? stripHtml(link.description) : undefined,
    published_at: new Date(),
    raw_points: sharerCount(link),
    raw_comments: 0,
    raw_stars_delta: 0,
  }));

  const failures = results
    .map((result, i) => (result.status === 'rejected' ? `${mastodon_instances[i]}: ${result.reason?.message ?? result.reason}` : null))
    .filter((reason): reason is string => reason !== null);

  if (items.length === 0 && failures.length > 0) {
    throw new Error(`Mastodon: all instances failed (${failures.join('; ')})`);
  }

  for (const reason of failures) {
    logger.error(`[NewsIngestion] Mastodon instance failed: ${reason}`);
  }

  return items;
};
