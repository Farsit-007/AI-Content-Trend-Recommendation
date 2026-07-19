/**
 * Last-resort thumbnail fallback, mirroring the backend's sourceLogos.ts. New ingestion runs
 * already backfill thumbnail_url with this same logo when nothing else is available (see
 * newsIngestion.metaEnrichment), but older stored items ingested before that existed may still have
 * no thumbnail_url at all — this covers those without needing a data migration.
 */
export const SOURCE_LOGOS: Record<string, string> = {
  hackernews: 'https://news.ycombinator.com/favicon.ico',
  devto: 'https://dev.to/favicon.ico',
  github_trending: 'https://github.com/favicon.ico',
  lobsters: 'https://lobste.rs/favicon.ico',
  mastodon: 'https://joinmastodon.org/favicon.ico',
  producthunt: 'https://www.producthunt.com/favicon.ico',
  stackoverflow: 'https://stackoverflow.com/favicon.ico',
};

export const sourceLogoFor = (source: string): string | undefined => SOURCE_LOGOS[source];
