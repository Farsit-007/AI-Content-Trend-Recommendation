export const newsItemSearchableFields: string[] = ['title', 'snippet', 'category', 'source'];

/**
 * Query params a caller may filter the feed by. Allowlisted rather than "everything not reserved" —
 * see QueryBuilder.filter(). Adding a field here is the only way to make it filterable.
 */
export const newsItemFilterableFields: string[] = [
  'category',
  'category_group',
  'source',
  'lifecycle',
  'needs_review',
  'processed',
  'content_status',
];

/**
 * Fields the feed may be sorted by. Deliberately excludes `embedding` and every other large field.
 *
 * `opportunity_score` is listed but is NOT sorted on the news item itself when a team context exists
 * — it resolves per team via `news_item_team_scores` (see NewsItemService.getAllNewsItems). It stays
 * in the allowlist because that is what the client asks for by name; the service routes it.
 *
 * `relevance_score` is deliberately absent. It is now a per-team value, and the copy stored on the
 * shared item is only a platform-wide baseline — so honouring `?sort=relevance_score` would return an
 * order no team actually sees. Nothing in the UI offers it.
 */
export const newsItemSortableFields: string[] = [
  'current_trend_score',
  'trend_score',
  'opportunity_score',
  'created_at',
  'published_at',
  'category_confidence',
];

/**
 * QueryBuilder's own `-createdAt` default names a field no schema in this project has, so it silently
 * did nothing. This is the real default: freshest-trending first, `created_at` breaking ties.
 */
export const newsItemDefaultSort = '-current_trend_score -created_at';
