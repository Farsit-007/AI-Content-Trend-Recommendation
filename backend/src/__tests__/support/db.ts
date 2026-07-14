import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

/**
 * Every integration test file follows the same lifecycle:
 *   beforeAll(connectTestDb)   — start an in-memory mongod and connect Mongoose once
 *   afterEach(clearTestDb)     — drop all collections so tests don't leak state into each other
 *   afterAll(disconnectTestDb) — disconnect and stop mongod
 */
export const connectTestDb = async (): Promise<void> => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

export const clearTestDb = async (): Promise<void> => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
};

export const disconnectTestDb = async (): Promise<void> => {
  await mongoose.disconnect();
  await mongod?.stop();
  mongod = undefined;
};
