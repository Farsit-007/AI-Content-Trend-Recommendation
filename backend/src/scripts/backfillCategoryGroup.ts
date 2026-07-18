/**
 * One-time backfill: sets `category_group = category` on every existing `NewsItem` that has a
 * `category` but no `category_group` yet. Trivial because every category stored before this change
 * shipped is already one of the fixed six — no lookup, no taxonomy query needed, just a direct
 * field copy. Safe to re-run (only touches documents where `category_group` doesn't already exist).
 *
 * Run: npm run backfill:category-group
 */
import mongoose from 'mongoose';
import config from '../app/config';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';

const main = async () => {
  await mongoose.connect(config.database_url as string);

  const result = await NewsItem.updateMany(
    { category: { $exists: true, $ne: null }, category_group: { $exists: false } },
    [{ $set: { category_group: '$category' } }],
  );

  console.log(`[backfillCategoryGroup] matched ${result.matchedCount}, modified ${result.modifiedCount}.`);
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[backfillCategoryGroup] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
