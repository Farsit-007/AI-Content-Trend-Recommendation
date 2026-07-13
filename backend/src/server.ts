import mongoose from 'mongoose';
import config from './app/config';
import app from './app';
import { verifyConnections } from './app/lib/verifyConnections';
import { Server } from 'http';
let server: Server;
async function main() {
  try {
    await mongoose.connect(config.database_url as string);
    await verifyConnections();
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
