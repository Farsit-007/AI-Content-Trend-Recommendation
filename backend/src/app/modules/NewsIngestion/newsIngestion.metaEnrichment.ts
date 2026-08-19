/**
 * Cheap, ungated fallback enrichment — distinct from newsIngestion.contentFetch's relevance-gated
 * full-article extraction. Most adapters already put a real description into `snippet` for free, but
 * a source that has none (a bare link submission, a source with no native description field) still
 * deserves a description, and every source deserves a thumbnail. This scrapes only the target page's
 * <head> meta tags (og:description/og:image, falling back to name="description"/twitter:image) —
 * far cheaper than full article-extractor parsing, so it's safe to run for every item regardless of
 * relevance score. `thumbnail_url` stays reserved for genuine photo-quality images (native or
 * og:image) — a source's static logo (frontend's sourceLogos.ts) is a small mark, never stretched
 * full-bleed, so it's a display-time fallback only, not something to store here.
 */
import config from '../../config';
import { logger } from '../../lib/logger';
import { decodeEntities } from './adapters/htmlText';
import { mapWithConcurrency } from '../../lib/concurrency';

const MAX_HEAD_BYTES = 200 * 1024;

const extractMetaContent = (html: string, key: string): string | undefined => {
  const attrFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i');
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  const match = html.match(attrFirst) ?? html.match(contentFirst);
  return match ? decodeEntities(match[1]) : undefined;
};

export interface OgMetadata {
  description?: string;
  image?: string;
}

/** Fetch-then-regex-scan only, no DOM parsing — soft-fails to `{}` on any error, matching this
 *  pipeline's enrichment philosophy everywhere else (never a request/run error). */
export const fetchOgMetadata = async (url: string): Promise<OgMetadata> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.news_ingestion.content_fetch.timeout_ms);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GrowthStudioBot/1.0 (+news metadata enrichment)' },
    });
    if (!res.ok) return {};

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return {};

    const html = await res.text();
    const head = html.length > MAX_HEAD_BYTES ? html.slice(0, MAX_HEAD_BYTES) : html;

    return {
      description: extractMetaContent(head, 'og:description') ?? extractMetaContent(head, 'description'),
      image: extractMetaContent(head, 'og:image') ?? extractMetaContent(head, 'twitter:image'),
    };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : (err instanceof Error ? err.message : err);
    logger.warn({ err: reason }, `[NewsIngestion] og-metadata scrape failed for ${url}`);
    return {};
  } finally {
    clearTimeout(timeout);
  }
};

interface EnrichableItem {
  source: string;
  url: string;
  description?: string;
  thumbnail_url?: string;
}

/** Backfills `description` and/or `thumbnail_url` only for items missing one or both — items that
 *  already have both from their adapter are passed through with zero network calls. */
export const enrichMetadata = async <T extends EnrichableItem>(items: T[]): Promise<T[]> =>
  mapWithConcurrency(items, config.news_ingestion.content_fetch.concurrency, async (item) => {
    if (item.description && item.thumbnail_url) return item;

    const needsDescription = !item.description;
    const needsThumbnail = !item.thumbnail_url;
    const meta = needsDescription || needsThumbnail ? await fetchOgMetadata(item.url) : {};

    return {
      ...item,
      description: item.description ?? meta.description,
      thumbnail_url: item.thumbnail_url ?? meta.image,
    };
  });
