import { apiGet } from './client';
import type { MaintenanceRunHistory } from './types';

/** GET /news-items/maintenance-runs — recent engagement-refresh + retention run history. */
export function getMaintenanceRuns(limit = 20, job?: 'engagement_refresh' | 'retention'): Promise<MaintenanceRunHistory> {
  return apiGet<MaintenanceRunHistory>('/news-items/maintenance-runs', { params: { limit, job } });
}
