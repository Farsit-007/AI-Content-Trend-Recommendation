import { AdapterResult } from '../newsIngestion.interface';
import { fetchDevTo } from './devto';
import { fetchGithubTrending } from './githubTrending';
import { fetchHackerNews } from './hackerNews';
import { fetchReddit } from './reddit';
import { fetchRss } from './rss';

const ADAPTERS: { source: string; fetch: () => Promise<Awaited<ReturnType<typeof fetchHackerNews>>> }[] = [
  { source: 'hackernews', fetch: fetchHackerNews },
  { source: 'devto', fetch: fetchDevTo },
  { source: 'github_trending', fetch: fetchGithubTrending },
  { source: 'reddit', fetch: fetchReddit },
  { source: 'rss', fetch: fetchRss },
];

export const runAllAdapters = async (): Promise<AdapterResult[]> => {
  return Promise.all(
    ADAPTERS.map(async ({ source, fetch }) => {
      try {
        const items = await fetch();
        return { source, items };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[NewsIngestion] Adapter "${source}" failed:`, message);
        return { source, items: [], error: message };
      }
    }),
  );
};
