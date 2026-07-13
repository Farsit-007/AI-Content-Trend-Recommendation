export const CATEGORIES = ["All", "AI", "Web Dev", "Career", "Security", "DevOps", "Other"] as const

export type Category = (typeof CATEGORIES)[number]

export type SortOption = "Trending" | "Latest" | "Relevance"

export const SORT_OPTIONS: SortOption[] = ["Trending", "Latest", "Relevance"]
