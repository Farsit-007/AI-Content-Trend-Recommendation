import * as Sentry from '@sentry/node';
import config from '../config';
import { logger } from './logger';

/**
 * Error reporting, deliberately optional.
 *
 * The gap this closes is lopsided: pipeline observability is genuinely strong — `ingestion_runs` and
 * `maintenance_runs` record per-source counts even when a run crashes — while the API serving real
 * users had nothing but pino lines nobody aggregates. A spike in provider failovers, a wave of 500s,
 * and a scheduler that silently stopped firing all looked identical from outside: silence.
 *
 * With `SENTRY_DSN` unset every function here is a no-op, so a deployment that hasn't configured it
 * behaves exactly as before rather than failing to boot. Nothing else in the codebase imports the
 * Sentry SDK directly — this is the only seam, so swapping providers later is one file.
 */

let initialized = false;

export const isErrorReportingEnabled = (): boolean => initialized;

export const initErrorReporting = (): void => {
  if (initialized || !config.sentry.dsn) return;

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.node_env,
    // Errors only by default. Performance tracing on a service that runs four cron jobs and calls
    // paid LLM APIs is a separate decision with its own cost, not something to switch on implicitly.
    tracesSampleRate: config.sentry.traces_sample_rate,
    // The request body can carry a topic, a draft, or a password on the auth routes. None of that
    // belongs in an error tracker, and Sentry's default is already to omit it — pinned so a future
    // SDK default change can't opt us in silently.
    sendDefaultPii: false,
  });

  initialized = true;
  logger.info(`[errorReporting] Sentry initialized for environment "${config.node_env}"`);
};

export interface ErrorContext {
  /** Where the error surfaced, e.g. `scheduler:news-ingestion` or `http`. */
  source: string;
  [key: string]: unknown;
}

/** Reports an error if reporting is configured. Never throws — a reporting failure must not cascade. */
export const reportError = (err: unknown, context: ErrorContext): void => {
  if (!initialized) return;

  try {
    Sentry.withScope((scope) => {
      scope.setTag('source', context.source);
      for (const [key, value] of Object.entries(context)) {
        if (key !== 'source') scope.setExtra(key, value);
      }
      Sentry.captureException(err);
    });
  } catch (reportingError) {
    logger.warn(
      { err: reportingError instanceof Error ? reportingError.message : reportingError },
      '[errorReporting] failed to report an error',
    );
  }
};

/**
 * Flushes buffered events, for the fatal paths in server.ts. Sentry sends asynchronously, so without
 * this the process exits before the very error that killed it is transmitted — the one you most need.
 */
export const flushErrorReporting = async (timeoutMs = 2_000): Promise<void> => {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // Nothing useful to do while the process is already going down.
  }
};
