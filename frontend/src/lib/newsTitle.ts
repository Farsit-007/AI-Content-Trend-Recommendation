/**
 * GitHub Trending and Product Hunt titles are adapter-composed as "identity — headline" (e.g.
 * "KlaatAI/klaatcode — Open-source AI coding agent for the terminal…" or "Notion — The all-in-one
 * workspace") — see the backend's enrichTitle/producthunt adapter. Rendered raw, that reads as one
 * long run-on string. This splits it so the descriptive half becomes the prominent heading and the
 * identity half becomes a small byline underneath, daily.dev-style. Titles without the separator
 * (every other source) pass through unchanged with no byline.
 */
export interface SplitNewsTitle {
  heading: string;
  handle?: string;
}

const SEPARATOR = ' — ';

export function splitNewsTitle(raw: string): SplitNewsTitle {
  const idx = raw.indexOf(SEPARATOR);
  if (idx <= 0) return { heading: raw };
  return {
    handle: raw.slice(0, idx).trim(),
    heading: raw.slice(idx + SEPARATOR.length).trim(),
  };
}
