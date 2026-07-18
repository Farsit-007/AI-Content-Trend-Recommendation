export interface IEngagementRefreshCounts {
  candidates: number;
  refreshed: number;
  source_removed: number;
  request_count: number;
  errors: Record<string, string>;
}

export interface IRetentionCounts {
  candidates: number;
  backfilled: number;
  archived: {
    max_age: number;
    trend_floor: number;
    source_removed: number;
  };
  deleted: number;
  overrides_removed: number;
  tombstones_written: number;
}

export type IMaintenanceRunCounts = IEngagementRefreshCounts | IRetentionCounts;

export interface IMaintenanceRun {
  job: 'engagement_refresh' | 'retention';
  started_at: Date;
  finished_at: Date;
  duration_ms: number;
  counts: IMaintenanceRunCounts;
  error?: string;
}
