import dns from 'dns';
import { Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import config from './app/config';
import { initErrorReporting, flushErrorReporting, reportError } from './app/lib/errorReporting';
import { logger } from './app/lib/logger';
import { redis } from './app/lib/redis';
import { startAutoGenerationScheduler, startEngagementRefreshScheduler, startNewsIngestionScheduler, startNewsRetentionScheduler } from './app/lib/scheduler';
import { seedSuperAdminIfMissing } from './app/lib/seedSuperAdmin';
import { seedDemoAccountsIfMissing } from './app/lib/seedDemoAccounts';
import { migrateLegacyRolesIfNeeded } from './app/lib/migrateLegacyRoles';
import { NewsCategoryTaxonomyService } from './app/modules/NewsCategoryTaxonomy/newsCategoryTaxonomy.service';
import { verifyConnections } from './app/lib/verifyConnections';

// Node's default resolver can fail `mongodb+srv://` SRV/TXT lookups on networks where the
// router doesn't proxy those record types correctly, even though the OS resolver handles them
// fine. Forcing a public resolver avoids that failure mode.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Before anything that can fail, so a crash during startup is itself reported. No-op without a DSN.
initErrorReporting();

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      timer.unref();
    }),
  ]);

// logger uses an async (worker-thread) pretty-print transport in development, so a
// bare process.exit() right after logger.fatal()/logger.info() can terminate the
// process before that last line is actually written — flush first so fatal errors
// and shutdown reasons are never silently lost from `docker logs`.
const exitAfterFlush = (code: number) => {
  // Sentry sends asynchronously, so without flushing first the process exits before the error that
  // killed it is ever transmitted — precisely the one worth having.
  void flushErrorReporting().finally(() => {
    logger.flush(() => process.exit(code));
  });
  setTimeout(() => process.exit(code), 4_000).unref();
};

let server: Server;
async function main() {
  try {
    await mongoose.connect(config.database_url as string);
    await seedSuperAdminIfMissing();
    await migrateLegacyRolesIfNeeded();
    await seedDemoAccountsIfMissing();
    await NewsCategoryTaxonomyService.seedFixedCategories();
    try {
      // Bounded independently of any per-call SDK timeout — verifyConnections is a
      // diagnostic check (failure here is already non-fatal), so it must never be able
      // to delay app.listen() below, no matter how long an external API call hangs.
      await withTimeout(verifyConnections(), 25_000, 'verifyConnections');
    } catch (verifyError) {
      logger.warn({ err: verifyError }, 'Connection verification failed, but continuing startup');
    }
    startNewsIngestionScheduler();
    startAutoGenerationScheduler();
    startEngagementRefreshScheduler();
    startNewsRetentionScheduler();
    server = app.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    reportError(error, { source: 'startup' });
    logger.fatal({ err: error }, 'Startup failed');
    exitAfterFlush(1);
  }
}
main();

// Stop accepting new requests, then close DB/Redis handles so in-flight work can finish.
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully...`);
  const closeConnections = async () => {
    try {
      await mongoose.connection.close();
      redis.disconnect();
    } finally {
      exitAfterFlush(0);
    }
  };
  if (server) {
    server.close(closeConnections);
    // Fallback if a stuck connection keeps the server from closing.
    setTimeout(() => exitAfterFlush(1), 10_000).unref();
  } else {
    void closeConnections();
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  reportError(reason, { source: 'unhandledRejection' });
  logger.fatal({ err: reason }, 'unhandledRejection detected, shutting down...');
  exitAfterFlush(1);
});

process.on('uncaughtException', (err) => {
  reportError(err, { source: 'uncaughtException' });
  logger.fatal({ err }, 'uncaughtException detected, shutting down...');
  exitAfterFlush(1);
});
