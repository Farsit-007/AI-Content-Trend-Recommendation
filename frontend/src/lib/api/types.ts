/** Pagination metadata returned by list endpoints. */
export interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
}

/** Standard backend success envelope: `{ success, message, meta?, data }`, plus any additive
 *  top-level fields a given endpoint chooses to send alongside `data` (e.g. `team_ready`). */
export interface ApiEnvelope<T> {
  success: true;
  message: string;
  meta?: Meta;
  data: T;
  team_ready?: boolean;
}

/** One field-level error entry from the backend error envelope. */
export interface ApiErrorSource {
  path: string | number;
  message: string;
}

/**
 * Normalized error thrown by the API client for any non-2xx response (or
 * network failure). Feature code catches this and shows `message`.
 */
export class ApiError extends Error {
  status: number;
  errorSource: ApiErrorSource[];

  constructor(
    message: string,
    status: number,
    errorSource: ApiErrorSource[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorSource = errorSource;
  }
}

/** Authenticated user shape returned by /auth/login and /auth/me. Only two global tiers —
 *  `super_admin` (full platform control) and `user` (everyone else). Team-scoped admin rights
 *  (`team_admin`) live on the team membership row instead — see `TeamMember.team_role`. */
export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'user';
  team_ids?: string[];
  created_at?: string;
}

/** Payload returned by /auth/login and /auth/refresh-token. */
export interface AuthTokens {
  token: string;
  refresh_token?: string;
  user: AuthUser;
}

/** Per-source, per-layer item counts for one ingestion run — see GET /news-items/ingestion-runs. */
export interface IngestionRunSourceCount {
  source: string;
  fetched: number;
  fresh_dropped: number;
  hash_deduped: number;
  semantic_deduped: number;
  relevance_dropped: number;
  stored: number;
  error?: string;
}

/** One persisted news-ingestion pipeline run, cron-triggered or manually triggered. */
export interface IngestionRun {
  _id: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  trigger: 'cron' | 'manual';
  total_stored: number;
  sources: IngestionRunSourceCount[];
  error?: string;
}

/** Per-source health computed from recent run history: consecutive zero-fetch runs. */
export interface SourceHealth {
  source: string;
  zero_streak: number;
  alert: boolean;
}

/** Payload returned by GET /news-items/ingestion-runs. */
export interface IngestionRunHistory {
  runs: IngestionRun[];
  sourceHealth: SourceHealth[];
}

/** Counts persisted for an `engagement_refresh` maintenance run. */
export interface EngagementRefreshCounts {
  candidates: number;
  refreshed: number;
  source_removed: number;
  request_count: number;
  errors: Record<string, string>;
}

/** Counts persisted for a `retention` maintenance run. */
export interface RetentionCounts {
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

/** One persisted `maintenance_runs` document — see GET /news-items/maintenance-runs. */
export interface MaintenanceRun {
  _id: string;
  job: 'engagement_refresh' | 'retention';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  counts: EngagementRefreshCounts | RetentionCounts;
  error?: string;
}

/** Payload returned by GET /news-items/maintenance-runs. */
export interface MaintenanceRunHistory {
  runs: MaintenanceRun[];
}
