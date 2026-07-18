/**
 * One-shot index migration for a live database: rebuilds GeneratedContent's indexes to match
 * the current schema. Needed because Mongo doesn't retroactively alter an existing index
 * definition — a live deployment keeps its old {team_id,news_item_id} sparse-unique index
 * until this runs, even though fresh test databases pick up the new partial-unique index
 * automatically. Safe to re-run; syncIndexes() is idempotent once the schema matches.
 *
 * Run: npm run db:sync-generated-content-indexes
 */
import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { GeneratedContent } from '../app/modules/GeneratedContent/generatedContent.model';

const main = async () => {
  await mongoose.connect(config.database_url as string);

  console.log('[syncGeneratedContentIndexes] syncing indexes for generated_content...');
  const result = await GeneratedContent.syncIndexes();
  console.log('[syncGeneratedContentIndexes] syncIndexes result:', result);

  const indexes = await GeneratedContent.collection.indexes();
  console.log('[syncGeneratedContentIndexes] current indexes:', JSON.stringify(indexes, null, 2));

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[syncGeneratedContentIndexes] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
