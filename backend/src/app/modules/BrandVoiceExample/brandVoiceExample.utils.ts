export const brandVoiceExampleSearchableFields: string[] = ['content', 'platform', 'category'];

/**
 * Allowlisted filter params — see QueryBuilder.filter(). `team_id` is listed so a member of several
 * teams can narrow to one; the service still intersects it with the caller's own memberships, so
 * naming another team's id here returns nothing rather than that team's examples.
 */
export const brandVoiceExampleFilterableFields: string[] = ['team_id', 'platform', 'category'];

/** Excludes `embedding` (1536-element arrays) and `content` (unbounded text) from sorting. */
export const brandVoiceExampleSortableFields: string[] = ['created_at', 'platform', 'category'];

export const brandVoiceExampleDefaultSort = '-created_at';
