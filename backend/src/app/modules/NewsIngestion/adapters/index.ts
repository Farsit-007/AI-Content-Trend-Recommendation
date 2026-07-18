import { logger } from '../../../lib/logger';
import { AdapterResult } from '../newsIngestion.interface';
import { fetchDevTo } from './devto';
import { fetchGithubTrending } from './githubTrending';
import { fetchHackerNews } from './hackerNews';
import { fetchLobsters } from './lobsters';
import { fetchMastodon } from './mastodon';
import { fetchProductHunt } from './producthunt';
import { fetchStackOverflow } from './stackoverflow';

const ADAPTERS: { source: string; fetch: () => Promise<Awaited<ReturnType<typeof fetchHackerNews>>> }[] = [
  { source: 'hackernews', fetch: fetchHackerNews },
  { source: 'devto', fetch: fetchDevTo },
  { source: 'github_trending', fetch: fetchGithubTrending },
  { source: 'lobsters', fetch: fetchLobsters },
  { source: 'mastodon', fetch: fetchMastodon },
  { source: 'producthunt', fetch: fetchProductHunt },
  { source: 'stackoverflow', fetch: fetchStackOverflow },
];

export const runAllAdapters = async (): Promise<AdapterResult[]> => {
  return Promise.all(
    ADAPTERS.map(async ({ source, fetch }) => {
      try {
        const items = await fetch();
        return { source, items };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, `[NewsIngestion] Adapter "${source}" failed`);
        return { source, items: [], error: message };
      }
    }),
  );
};
