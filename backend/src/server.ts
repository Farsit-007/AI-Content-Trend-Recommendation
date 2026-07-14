import dns from 'dns';
import mongoose from 'mongoose';
import config from './app/config';
import app from './app';
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
      console.warn('[WARNING] Connection verification failed, but continuing startup:', verifyError);
    }
    startNewsIngestionScheduler();
    startAnalyticsScheduler();
    startAutoGenerationScheduler();
    server = app.listen(config.port, () => {
      console.log(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
main();

process.on('unhandledRejection', () => {
  console.log('unhandledRejection is detected , shutting down...');
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
  process.exit(1);
});

process.on('uncaughtException', () => {
  console.log('uncaughtException is detected , shutting down...');
  process.exit(1);
});
