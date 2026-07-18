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

export interface IIngestionRun {
  started_at: Date;
  finished_at: Date;
  duration_ms: number;
  trigger: 'cron' | 'manual';
  total_stored: number;
  sources: ISourceRunCount[];
  adjudication?: IAdjudicationCounts;
  error?: string;
}
