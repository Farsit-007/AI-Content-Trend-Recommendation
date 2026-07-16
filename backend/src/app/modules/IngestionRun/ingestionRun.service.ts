import { IIngestionRun } from './ingestionRun.interface';
import { IngestionRun } from './ingestionRun.model';

const MAX_LIMIT = 100;
const ZERO_STREAK_ALERT_THRESHOLD = 3;

const listRuns = async (limit: number): Promise<IIngestionRun[]> => {
  const bounded = Math.min(Math.max(limit, 1), MAX_LIMIT);
  return IngestionRun.find().sort({ started_at: -1 }).limit(bounded);
};

export interface SourceHealth {
  source: string;
  zero_streak: number;
  alert: boolean;
}

/**
 * Walks `runs` (already newest-first) once per distinct source, counting a leading streak of
 * `fetched === 0` from the most recent run backward. A source absent from a run's `sources` array
 * counts as `fetched: 0` for that run — an adapter that isn't even attempting to fetch is exactly
 * as dead as one that tried and got nothing.
 */
export const computeZeroStreaks = (runs: IIngestionRun[]): SourceHealth[] => {
  const sources = new Set<string>();
  for (const run of runs) {
    for (const s of run.sources) sources.add(s.source);
  }

  return Array.from(sources).map((source) => {
    let zero_streak = 0;
    for (const run of runs) {
      const fetched = run.sources.find((s) => s.source === source)?.fetched ?? 0;
      if (fetched > 0) break;
      zero_streak += 1;
    }
    return { source, zero_streak, alert: zero_streak >= ZERO_STREAK_ALERT_THRESHOLD };
  });
};

export const IngestionRunService = {
  listRuns,
  computeZeroStreaks,
};
