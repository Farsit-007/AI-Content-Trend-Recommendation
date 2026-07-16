import config from '../../../config';
import { logger } from '../../../lib/logger';
import { RawNewsItem } from '../newsIngestion.interface';
import { decodeEntities, stripHtml } from './htmlText';

/**
 * GitHub has no official trending API, so one fetch path scrapes the public trending page's
 * HTML with targeted regexes — inherently brittle, since a markup change silently returns fewer
 * (or zero) matches rather than throwing. A second, official-API-based path (recently-created
 * popular repos) supplements it: it isn't starved by hash-dedup the way a slow-moving trending
 * list is (a repo trending for days gets hash-deduped after its first successful run — see
 * design.md), and it carries a real `created_at`/`description` the scrape can't reliably extract.
 * The two paths are merged; see `fetchGithubTrending` for the soft-failure-vs-real-failure logic.
 */

const SEARCH_API_URL = 'https://api.github.com/search/repositories';
const TITLE_TRUNCATE_LENGTH = 200;

/** Strengthens a bare `owner/repo` title's relevance-scoring signal with real semantic content. */
export const enrichTitle = (fullName: string, description?: string | null): string => {
  if (!description) return fullName;
  const truncated = description.length > TITLE_TRUNCATE_LENGTH ? `${description.slice(0, TITLE_TRUNCATE_LENGTH)}…` : description;
  return `${fullName} — ${truncated}`;
};

const extractRepoBlocks = (html: string): string[] => {
  const matches = html.match(/<article class="Box-row"[\s\S]*?<\/article>/g);
  return matches ?? [];
};

const parseRepoBlock = (block: string): RawNewsItem | null => {
  const hrefMatch = block.match(/<a[^>]*href="\/([^"/]+\/[^"?#]+)"/);
  if (!hrefMatch) return null;
  const repoPath = hrefMatch[1] as string;

  const descriptionMatch = block.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/);
  const snippet = descriptionMatch ? decodeEntities(stripHtml(descriptionMatch[1])) : undefined;

  const starsMatch = block.match(/([\d,]+)\s+stars?\s+today/);
  const starsToday = starsMatch ? Number(starsMatch[1].replace(/,/g, '')) : 0;

  return {
    source: 'github_trending',
    source_id: repoPath,
    title: enrichTitle(repoPath, snippet),
    url: `https://github.com/${repoPath}`,
    snippet,
    published_at: undefined,
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: starsToday,
  };
};

/** Zero parsed blocks from a 200 response is a legitimate empty result here, not a throw — the
 * caller (`fetchGithubTrending`) decides whether that's an overall failure using both paths. */
const fetchTrendingScrape = async (): Promise<RawNewsItem[]> => {
  const res = await fetch('https://github.com/trending', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthStudioBot/1.0)' },
  });
  if (!res.ok) throw new Error(`GitHub trending request failed: ${res.status}`);
  const html = await res.text();

  return extractRepoBlocks(html)
    .map(parseRepoBlock)
    .filter((item): item is RawNewsItem => item !== null);
};

interface GithubSearchRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  created_at: string;
  stargazers_count: number;
}

interface GithubSearchResponse {
  items: GithubSearchRepo[];
}

/** UTC YYYY-MM-DD, tracking NEWS_INGESTION_MAX_AGE_HOURS so the query window matches the
 * pipeline's own freshness filter — the same mismatch `news-source-quick-wins` fixed for dev.to. */
const freshnessWindowStartDate = (): string => {
  const cutoff = new Date(Date.now() - config.news_ingestion.max_age_hours * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
};

const fetchRecentPopular = async (): Promise<RawNewsItem[]> => {
  const query = `created:>=${freshnessWindowStartDate()}`;
  const url = `${SEARCH_API_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (config.news_ingestion.github_token) {
    headers.Authorization = `Bearer ${config.news_ingestion.github_token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub Search API request failed: ${res.status}`);

  const body = (await res.json()) as GithubSearchResponse;
  if (!Array.isArray(body.items)) throw new Error('GitHub Search API returned an unexpected response shape');

  return body.items.map((repo) => ({
    source: 'github_trending',
    source_id: repo.full_name,
    title: enrichTitle(repo.full_name, repo.description),
    url: repo.html_url,
    snippet: repo.description ?? undefined,
    published_at: new Date(repo.created_at),
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: repo.stargazers_count,
  }));
};

export const fetchGithubTrending = async (): Promise<RawNewsItem[]> => {
  const [scrapeResult, apiResult] = await Promise.allSettled([fetchTrendingScrape(), fetchRecentPopular()]);

  const scrapeItems = scrapeResult.status === 'fulfilled' ? scrapeResult.value : [];
  const apiItems = apiResult.status === 'fulfilled' ? apiResult.value : [];

  const merged = new Map<string, RawNewsItem>();
  for (const item of [...scrapeItems, ...apiItems]) {
    if (!merged.has(item.source_id)) merged.set(item.source_id, item);
  }
  const items = Array.from(merged.values());

  if (items.length > 0) {
    // One path failing while the other delivers is not this source's failure — log it and move on.
    if (scrapeResult.status === 'rejected') {
      logger.error({ err: scrapeResult.reason?.message ?? scrapeResult.reason }, '[NewsIngestion] GitHub Trending scrape failed');
    }
    if (apiResult.status === 'rejected') {
      logger.error({ err: apiResult.reason?.message ?? apiResult.reason }, '[NewsIngestion] GitHub Search API failed');
    }
    return items;
  }

  // Empty merged result: distinguish "both paths legitimately found nothing" (not an error) from
  // "at least one path actually broke" (a real failure the run history should surface).
  if (scrapeResult.status === 'rejected' || apiResult.status === 'rejected') {
    const reasons = [
      scrapeResult.status === 'rejected' ? `scrape: ${scrapeResult.reason?.message ?? scrapeResult.reason}` : null,
      apiResult.status === 'rejected' ? `search API: ${apiResult.reason?.message ?? apiResult.reason}` : null,
    ].filter(Boolean);
    throw new Error(`GitHub Trending: both fetch paths yielded nothing (${reasons.join('; ')})`);
  }

  return items;
};
