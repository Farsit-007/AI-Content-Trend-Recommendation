import { RawNewsItem } from '../newsIngestion.interface';

/**
 * GitHub has no official trending API, so this scrapes the public trending
 * page's HTML with targeted regexes. This is inherently brittle — if GitHub
 * changes the page markup, `extractRepoBlocks`/the per-field regexes below
 * will silently return fewer (or zero) matches rather than throwing, which is
 * why the pipeline treats an empty result from this adapter as a soft
 * failure, not an error (see design.md Risks).
 */

const decodeEntities = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const extractRepoBlocks = (html: string): string[] => {
  const matches = html.match(/<article class="Box-row"[\s\S]*?<\/article>/g);
  return matches ?? [];
};

const parseRepoBlock = (block: string): RawNewsItem | null => {
  const hrefMatch = block.match(/<a[^>]*href="\/([^"/]+\/[^"?#]+)"/);
  if (!hrefMatch) return null;
  const repoPath = hrefMatch[1] as string;

  const descriptionMatch = block.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/);
  const snippet = descriptionMatch ? decodeEntities(descriptionMatch[1].replace(/<[^>]+>/g, '')) : undefined;

  const starsMatch = block.match(/([\d,]+)\s+stars?\s+today/);
  const starsToday = starsMatch ? Number(starsMatch[1].replace(/,/g, '')) : 0;

  return {
    source: 'github_trending',
    source_id: repoPath,
    title: repoPath,
    url: `https://github.com/${repoPath}`,
    snippet,
    published_at: undefined,
    raw_points: 0,
    raw_comments: 0,
    raw_stars_delta: starsToday,
  };
};

export const fetchGithubTrending = async (): Promise<RawNewsItem[]> => {
  const res = await fetch('https://github.com/trending', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthStudioBot/1.0)' },
  });
  if (!res.ok) throw new Error(`GitHub trending request failed: ${res.status}`);
  const html = await res.text();

  return extractRepoBlocks(html)
    .map(parseRepoBlock)
    .filter((item): item is RawNewsItem => item !== null);
};
