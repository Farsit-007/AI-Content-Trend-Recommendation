import dns from 'dns';
import mongoose from 'mongoose';
import config from './app/config';
import app from './app';
import { logger } from './app/lib/logger';
import { redis } from './app/lib/redis';
import { verifyConnections } from './app/lib/verifyConnections';
import { seedSuperAdminIfMissing } from './app/lib/seedSuperAdmin';
import { startAnalyticsScheduler, startAutoGenerationScheduler, startNewsIngestionScheduler } from './app/lib/scheduler';
import { Server } from 'http';

// Node's default resolver can fail `mongodb+srv://` SRV/TXT lookups on networks where the
// router doesn't proxy those record types correctly, even though the OS resolver handles them
// fine. Forcing a public resolver avoids that failure mode.
dns.setServers(['8.8.8.8', '1.1.1.1']);

let server: Server;
async function main() {
  try {
    await mongoose.connect(config.database_url as string);
    await seedSuperAdminIfMissing();
    try {
      await verifyConnections();
    } catch (verifyError) {
      logger.warn({ err: verifyError }, 'Connection verification failed, but continuing startup');
    }
    startNewsIngestionScheduler();
    startAnalyticsScheduler();
    startAutoGenerationScheduler();
    server = app.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Startup failed');
    process.exit(1);
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
      process.exit(0);
    }
  };
  if (server) {
    server.close(closeConnections);
    // Fallback if a stuck connection keeps the server from closing.
    setTimeout(() => process.exit(1), 10_000).unref();
  } else {
    void closeConnections();
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection detected, shutting down...');
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException detected, shutting down...');
  process.exit(1);
});
