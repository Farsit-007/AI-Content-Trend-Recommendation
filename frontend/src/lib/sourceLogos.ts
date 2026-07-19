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

const LOGO_URLS = new Set(Object.values(SOURCE_LOGOS));

/**
 * True when a `thumbnail_url` is really just a source mark rather than a photo.
 *
 * Because metaEnrichment backfills `thumbnail_url` with the source logo above when a real image
 * can't be found, plenty of items arrive carrying a 16x16 favicon in the field the UI otherwise
 * treats as cover art. Stretching one of those `object-cover` across a card-width canvas produces
 * a blurry smear, so callers use this to render it as a centered badge instead.
 *
 * This only catches logos we can recognise from the URL — a small image from an unknown host still
 * needs the intrinsic-size check at render time.
 */
export const isSourceLogoUrl = (url?: string): boolean => {
  if (!url) return false;
  return LOGO_URLS.has(url) || /\/favicon\.\w+(\?|$)/i.test(url);
};
