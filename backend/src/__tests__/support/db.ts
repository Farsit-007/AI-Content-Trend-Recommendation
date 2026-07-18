import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { NewsCategoryTaxonomyService } from '../../app/modules/NewsCategoryTaxonomy/newsCategoryTaxonomy.service';

let mongod: MongoMemoryServer | undefined;

/**
 * Every integration test file follows the same lifecycle:
 *   beforeAll(connectTestDb)   — start an in-memory mongod and connect Mongoose once
 *   afterEach(clearTestDb)     — drop all collections so tests don't leak state into each other
 *   afterAll(disconnectTestDb) — disconnect and stop mongod
 *
 * Production seeds the fixed-six category taxonomy at server boot (`server.ts`); tests never run
 * that boot sequence, so both lifecycle hooks below re-seed it here — team-subscription validation
 * (`team.validation.ts`) checks the live taxonomy, so any test touching `subscribed_categories`
 * implicitly depends on the fixed six already existing, exactly like production does.
 */
export const connectTestDb = async (): Promise<void> => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await NewsCategoryTaxonomyService.seedFixedCategories();
};

export const clearTestDb = async (): Promise<void> => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
  await NewsCategoryTaxonomyService.seedFixedCategories();
};

export const disconnectTestDb = async (): Promise<void> => {
  await mongoose.disconnect();
  await mongod?.stop();
  mongod = undefined;
};
