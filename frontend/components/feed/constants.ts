// Categories are no longer a fixed set — teams can add their own on top of the defaults
// (see lib/api/teams.ts). "All" is prepended client-side wherever the tab list is built.
export type Category = string

export type SortOption = "Trending" | "Latest" | "Relevance"

export const SORT_OPTIONS: SortOption[] = ["Trending", "Latest", "Relevance"]
