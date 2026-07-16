import { apiGet } from './client';
import type { IngestionRunHistory } from './types';

/** GET /news-items/ingestion-runs — recent pipeline run history + per-source zero-streak health. */
export function getIngestionRuns(limit = 20): Promise<IngestionRunHistory> {
  return apiGet<IngestionRunHistory>('/news-items/ingestion-runs', { params: { limit } });
}
