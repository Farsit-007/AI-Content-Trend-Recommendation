/**
 * Frontend error reporting, deliberately optional and deliberately lazy.
 *
 * Lazy because the whole SDK is dead weight for a deployment that hasn't set `VITE_SENTRY_DSN`, and
 * this app was just code-split specifically to stop shipping code nobody runs — statically importing
 * `@sentry/react` would undo a chunk of that for a feature that may be switched off. The dynamic
 * import means Rollup emits it as its own chunk, fetched only when a DSN is actually present.
 *
 * Every export is safe to call before (or without) initialization.
 */

type SentryModule = typeof import('@sentry/react');

let sentry: SentryModule | null = null;
/** Errors thrown before the SDK chunk finishes loading — replayed once it does. */
const pending: { error: unknown; context: Record<string, unknown> }[] = [];

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export const isErrorReportingEnabled = (): boolean => Boolean(dsn);

export async function initErrorReporting(): Promise<void> {
  if (!dsn || sentry) return;

  try {
    const mod = await import('@sentry/react');
    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      // Errors only. Session replay and tracing carry real bandwidth and privacy weight and should
      // be switched on deliberately, not inherited from a default.
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    sentry = mod;

    for (const { error, context } of pending.splice(0)) {
      reportError(error, context);
    }
  } catch {
    // A blocked or failed SDK fetch must never take the app down with it — reporting is diagnostic.
  }
}

export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!dsn) return;

  if (!sentry) {
    // The interesting case: an error during first paint, before the SDK chunk has arrived. Queue it
    // rather than dropping it — early errors are the ones hardest to reproduce.
    pending.push({ error, context });
    return;
  }

  try {
    sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) scope.setExtra(key, value);
      sentry!.captureException(error);
    });
  } catch {
    // Ignore — a reporting failure is not worth surfacing to the user.
  }
}
