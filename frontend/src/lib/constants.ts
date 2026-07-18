/** The fixed news taxonomy the categorization LLM assigns from — mirrors backend NEWS_CATEGORIES. */
export const NEWS_CATEGORIES = ['AI', 'Web Dev', 'Career', 'Security', 'DevOps', 'Other'] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface FeedSortOption {
  value: string;
  label: string;
}

/** Explicit sort options for the feed — the backend's default sort is a no-op, so one of these is always sent. */
export const FEED_SORT_OPTIONS: FeedSortOption[] = [
  { value: '-opportunity_score', label: 'Opportunity' },
  { value: '-trend_score', label: 'Trending' },
  { value: '-created_at', label: 'Newest' },
];

export const DEFAULT_FEED_SORT = FEED_SORT_OPTIONS[0].value;
