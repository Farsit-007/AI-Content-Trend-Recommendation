import config from '../../config';
import { mapWithConcurrency } from '../../lib/concurrency';
import { logger } from '../../lib/logger';
import { decodeEntities, stripHtml } from './adapters/htmlText';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

interface DevToArticleDetail {
  body_markdown?: string;
}

/** `GET /api/articles/{id}` — the full article body, not the description-only listing response. */
export const fetchDevToBody = async (sourceId: string): Promise<string | undefined> => {
  try {
    const res = await fetch(`https://dev.to/api/articles/${sourceId}`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as DevToArticleDetail;
    return body.body_markdown || undefined;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] dev.to body fetch failed for ${sourceId}`);
    return undefined;
  }
};

/** `GET /repos/{owner}/{repo}/readme` via the raw media type — README text, not the GitHub web UI page. */
export const fetchGithubReadme = async (sourceId: string): Promise<string | undefined> => {
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github.raw+json' };
    if (config.news_ingestion.github_token) {
      headers.Authorization = `Bearer ${config.news_ingestion.github_token}`;
    }

    const res = await fetch(`https://api.github.com/repos/${sourceId}/readme`, { headers });
    if (!res.ok) return undefined;
    const text = await res.text();
    return text || undefined;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] GitHub README fetch failed for ${sourceId}`);
    return undefined;
  }
};

/**
 * Guarded fetch-then-extract for a linked page: our own fetch (so timeout/size/content-type
 * policy is always ours), then `article-extractor`'s HTML→article-text parsing only. Every
 * failure path returns undefined rather than throwing — this is enrichment, never gating.
 */
export const extractFromUrl = async (url: string): Promise<string | undefined> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.news_ingestion.content_fetch.timeout_ms);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GrowthStudioBot/1.0 (+news content enrichment)' },
    });

    if (!res.ok) {
      logger.warn(`[NewsIngestion] content extraction: non-2xx status ${res.status} for ${url}`);
      return undefined;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      logger.warn(`[NewsIngestion] content extraction: non-HTML content-type "${contentType}" for ${url}`);
      return undefined;
    }

    const html = await res.text();
    if (Buffer.byteLength(html, 'utf-8') > MAX_RESPONSE_BYTES) {
      logger.warn(`[NewsIngestion] content extraction: response exceeded ${MAX_RESPONSE_BYTES} bytes for ${url}`);
      return undefined;
    }

    // Lazy-loaded: @extractus/article-extractor ships ESM-only, and this keeps that constraint
    // from leaking into every module that transitively imports this file (incl. under ts-jest,
    // which can't statically parse the package's ESM entry point at require() time).
    const { extractFromHtml } = await import('@extractus/article-extractor');
    const article = await extractFromHtml(html, url);
    const rawContent = article?.content;
    if (!rawContent) {
      logger.warn(`[NewsIngestion] content extraction: no extractable article content for ${url}`);
      return undefined;
    }

    const text = decodeEntities(stripHtml(rawContent)).replace(/\s+/g, ' ').trim();
    if (!text) {
      logger.warn(`[NewsIngestion] content extraction: extracted text was empty after stripping for ${url}`);
      return undefined;
    }

    return text;
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : (err instanceof Error ? err.message : err);
    logger.warn({ err: reason }, `[NewsIngestion] content extraction failed for ${url}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

interface EnrichableItem {
  source: string;
  source_id: string;
  url: string;
  content?: string;
  content_status?: 'failed';
}

export interface ContentFetchCounts {
  fetched: number;
  failed: number;
}

/**
 * Fills `content` for items that don't already have it (from `news-full-content-sources`'s
 * direct-from-adapter enrichment), routing dev.to and GitHub Trending to their respective APIs
 * and everything else to generic page extraction. Items that already carry content are passed
 * through untouched and contribute to neither count. A route that finds nothing marks the item
 * `content_status: 'failed'` rather than leaving it ambiguous with "never attempted".
 */
export const enrichContent = async <T extends EnrichableItem>(
  items: T[],
): Promise<{ items: T[]; countsBySource: Record<string, ContentFetchCounts> }> => {
  const countsBySource: Record<string, ContentFetchCounts> = {};
  const bump = (source: string, key: keyof ContentFetchCounts) => {
    countsBySource[source] = countsBySource[source] ?? { fetched: 0, failed: 0 };
    countsBySource[source][key] += 1;
  };

  const enriched = await mapWithConcurrency(items, config.news_ingestion.content_fetch.concurrency, async (item) => {
    if (item.content) return item;

    const fetchedText =
      item.source === 'devto'
        ? await fetchDevToBody(item.source_id)
        : item.source === 'github_trending'
          ? await fetchGithubReadme(item.source_id)
          : await extractFromUrl(item.url);

    if (fetchedText) {
      bump(item.source, 'fetched');
      return { ...item, content: fetchedText };
    }

    bump(item.source, 'failed');
    return { ...item, content_status: 'failed' as const };
  });

  return { items: enriched, countsBySource };
};

// Re-exported for the existing unit tests that import it from here; the implementation lives in
// lib/concurrency.ts so mocking this module can't stub it out from under metaEnrichment.
export { mapWithConcurrency };
