export interface ISourceRunCount {
  source: string;
  fetched: number;
  fresh_dropped: number;
  hash_deduped: number;
  semantic_deduped: number;
  relevance_dropped: number;
  stored: number;
  error?: string;
  content_fetched?: number;
  content_failed?: number;
}

/** Run-level two-band adjudication counters (D2). Run-level, not per-source: a gray pair spans two
 * sources, so per-source attribution would be arbitrary. */
export interface IAdjudicationCounts {
  gray_pairs: number;
  batches: number;
  verdict_duplicate: number;
  verdict_update: number;
  verdict_distinct: number;
  fallbacks: number;
}

/**
 * Run-level Layer 4 counters. Run-level rather than per-source because the categorization cap ranks
 * globally by trend score, so which source an over-cap item came from is incidental.
 */
export interface ICategorizationCounts {
  /** Items sent to the categorization LLM. */
  llm_categorized: number;
  /** Items over `NEWS_INGESTION_MAX_CATEGORIZE_ITEMS`, stored with the fallback category + needs_review. */
  cap_deferred: number;
}

export interface IIngestionRun {
  started_at: Date;
  finished_at: Date;
  duration_ms: number;
  trigger: 'cron' | 'manual';
  total_stored: number;
  sources: ISourceRunCount[];
  adjudication?: IAdjudicationCounts;
  categorization?: ICategorizationCounts;
  error?: string;
}
