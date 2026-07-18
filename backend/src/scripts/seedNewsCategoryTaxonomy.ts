/**
 * Idempotently seeds the global category taxonomy with the fixed six built-in categories. Also
 * run automatically on every server boot (`server.ts`) — this script exists for explicit/manual
 * runs (e.g. against a database that hasn't booted the server yet) and mirrors this codebase's
 * existing `seed:*` script conventions.
 *
 * Run: npm run seed:news-categories
 */
import mongoose from 'mongoose';
import config from '../app/config';
import { NewsCategoryTaxonomyService } from '../app/modules/NewsCategoryTaxonomy/newsCategoryTaxonomy.service';

const main = async () => {
  await mongoose.connect(config.database_url as string);
  await NewsCategoryTaxonomyService.seedFixedCategories();
  console.log('[seedNewsCategoryTaxonomy] fixed six categories seeded (idempotent).');
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[seedNewsCategoryTaxonomy] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
