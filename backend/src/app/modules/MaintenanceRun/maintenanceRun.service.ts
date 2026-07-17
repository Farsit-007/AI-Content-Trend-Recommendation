import { IMaintenanceRun } from './maintenanceRun.interface';
import { MaintenanceRun } from './maintenanceRun.model';

const MAX_LIMIT = 100;

const listRuns = async (limit: number, job?: 'engagement_refresh' | 'retention'): Promise<IMaintenanceRun[]> => {
  const bounded = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const filter = job ? { job } : {};
  return MaintenanceRun.find(filter).sort({ started_at: -1 }).limit(bounded);
};

export const MaintenanceRunService = {
  listRuns,
};
