/**
 * Wipes every application collection except super_admin `User` documents, for a clean testing
 * slate. Maximally destructive by design — hard safety rails: refuses outside a non-production
 * NODE_ENV, requires either an explicit --yes flag or a typed confirmation (interactive only),
 * and always prints the target DB host + a per-collection document count before deleting anything.
 *
 * Run: npm run dev:reset-data -- --yes
 * (or without --yes, interactively, to get a "type the database name to confirm" prompt)
 *
 * Exact collection list (15 wiped-in-full + `users` filtered) — confirmed by enumerating every
 * `model<...>(...)` call under backend/src/app/modules/*\/*.model.ts. If a new module/collection
 * is ever added, add its name to COLLECTIONS_TO_WIPE below — this list does not update itself:
 * team_memberships, style_examples, news_items, news_dedup_ledger, news_item_category_overrides,
 * ingestion_runs, maintenance_runs, generated_content, style_packs, brand_voice_examples,
 * chat_messages, llm_providers, llm_models, llm_task_defaults, teams, and users (role != super_admin).
 *
 * This script is never invoked by the running server — operator tooling only.
 */
import mongoose from 'mongoose';
import readline from 'readline';
import config from '../app/config';

// Dependents before what they depend on, so a crash mid-run never leaves an orphaned reference
// (team_memberships before teams; style_examples before style_packs) — mirrors the existing
// app-level two-step cascade pattern in llmProvider.service.ts::deleteProvider.
const COLLECTIONS_TO_WIPE = [
  'team_memberships',
  'style_examples',
  'news_items',
  'news_dedup_ledger',
  'news_item_category_overrides',
  'ingestion_runs',
  'maintenance_runs',
  'generated_content',
  'style_packs',
  'brand_voice_examples',
  'chat_messages',
  'llm_providers',
  'llm_models',
  'llm_task_defaults',
  'teams',
];

const args = process.argv.slice(2);
const autoConfirm = args.includes('--yes');

const redactedDbHost = (url: string): string => {
  try {
    return new URL(url.replace(/^mongodb(\+srv)?:\/\//, 'http://')).host;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
};

const promptTypedConfirmation = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });

const main = async () => {
  if (config.node_env === 'production') {
    console.error('[resetDevData] refusing to run — NODE_ENV is "production"');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose connected but connection.db is undefined');

  const dbName = db.databaseName;
  console.log(`[resetDevData] target: ${redactedDbHost(config.database_url as string)} / database "${dbName}"`);
  console.log('[resetDevData] this will delete ALL documents in the following collections:');

  const preCounts: Record<string, number> = {};
  for (const name of COLLECTIONS_TO_WIPE) {
    preCounts[name] = await db.collection(name).countDocuments();
    console.log(`  - ${name}: ${preCounts[name]} document(s)`);
  }
  const nonSuperAdminUserCount = await db.collection('users').countDocuments({ role: { $ne: 'super_admin' } });
  console.log(`  - users (role != super_admin): ${nonSuperAdminUserCount} document(s)`);

  if (!autoConfirm) {
    if (!process.stdin.isTTY) {
      console.error('[resetDevData] no --yes flag and not running interactively — refusing to delete anything');
      await mongoose.disconnect();
      process.exit(1);
    }
    const answer = await promptTypedConfirmation(
      `\nType the database name ("${dbName}") to confirm this destructive reset: `,
    );
    if (answer.trim() !== dbName) {
      console.error('[resetDevData] confirmation did not match — aborting, nothing was deleted');
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  console.log('\n[resetDevData] deleting...');
  const deletedCounts: Record<string, number> = {};
  for (const name of COLLECTIONS_TO_WIPE) {
    const result = await db.collection(name).deleteMany({});
    deletedCounts[name] = result.deletedCount ?? 0;
  }
  const usersResult = await db.collection('users').deleteMany({ role: { $ne: 'super_admin' } });
  deletedCounts['users (role != super_admin)'] = usersResult.deletedCount ?? 0;

  console.log('\n[resetDevData] done — deleted counts:');
  for (const [name, count] of Object.entries(deletedCounts)) {
    console.log(`  - ${name}: ${count}`);
  }
  console.log(
    '\n[resetDevData] reminder: this does not touch Redis (response/fact-sheet caches). ' +
      'Run `redis-cli FLUSHDB` manually if a fully clean cache is also wanted.',
  );

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[resetDevData] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
