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

export interface IIngestionRun {
  started_at: Date;
  finished_at: Date;
  duration_ms: number;
  trigger: 'cron' | 'manual';
  total_stored: number;
  sources: ISourceRunCount[];
  error?: string;
}
